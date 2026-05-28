import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const sales = await prisma.posSale.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { soldAt: "desc" },
      take: 20,
      include: {
        lines: {
          include: {
            product: {
              select: { name: true },
            },
          },
        },
      },
    });

    return apiOk({
      sales: sales.map((sale) => ({
        id: sale.id,
        saleId: sale.externalSaleId,
        soldAt: sale.soldAt.toISOString(),
        totalMl: sale.lines.reduce((sum, line) => sum + line.decrementMl, 0),
        lines: sale.lines.map((line) => ({
          productName: line.product.name,
          quantity: line.quantity,
          pourMl: Number(line.pourMl),
        })),
      })),
    });
  } catch (error) {
    return apiError("POS_SALES_FETCH_FAILED", "Failed to fetch recent POS sales", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
