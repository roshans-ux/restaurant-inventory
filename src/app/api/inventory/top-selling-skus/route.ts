import { NextRequest } from "next/server";
import { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { parseSalesPeriod, salesPeriodStart, type SalesPeriod } from "@/lib/sales-period";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const period = parseSalesPeriod(request.nextUrl.searchParams.get("period"));
  const periodStart = salesPeriodStart(period);

  try {
    const grouped = await prisma.stockMovement.groupBy({
      by: ["productId"],
      where: {
        type: StockMovementType.SALE,
        product: { tenantId: session.tenantId },
        ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
      },
      _sum: { quantityDeltaMl: true },
    });

    const withSales = grouped
      .map((row) => ({
        productId: row.productId,
        totalMlSold: Math.abs(row._sum.quantityDeltaMl ?? 0),
      }))
      .filter((row) => row.totalMlSold > 0);

    if (withSales.length === 0) {
      return apiOk({ period, skus: [] });
    }

    const products = await prisma.product.findMany({
      where: {
        tenantId: session.tenantId,
        id: { in: withSales.map((r) => r.productId) },
      },
      select: { id: true, name: true, bottleSizeMl: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const skus = withSales
      .map((row) => {
        const product = productById.get(row.productId);
        const bottleSizeMl = product ? Number(product.bottleSizeMl) : 0;
        if (bottleSizeMl <= 0) return null;
        const totalBottlesSold =
          Math.round((row.totalMlSold / bottleSizeMl) * 10) / 10;
        return {
          productId: row.productId,
          name: product?.name ?? "Unknown",
          totalMlSold: row.totalMlSold,
          bottleSizeMl,
          totalBottlesSold,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.totalBottlesSold - a.totalBottlesSold);

    return apiOk({ period, skus });
  } catch (error) {
    return apiError("TOP_SELLING_SKUS_FAILED", "Failed to fetch top selling SKUs", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
