import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      include: {
        reorderConfig: true,
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const levels = await Promise.all(
      products.map(async (product) => {
        const sum = await prisma.stockMovement.aggregate({
          where: { productId: product.id },
          _sum: { quantityDeltaMl: true },
        });

        const currentMl = sum._sum.quantityDeltaMl ?? 0;
        const currentBottles = currentMl / Number(product.bottleSizeMl);

        return {
          productId: product.id,
          name: product.name,
          bottleSizeMl: Number(product.bottleSizeMl),
          currentMl,
          currentBottles: Number(currentBottles.toFixed(2)),
          thresholdBottles: product.reorderConfig
            ? Math.round(Number(product.reorderConfig.thresholdBottles))
            : null,
          lastMovement: product.stockMovements[0] ?? null,
        };
      }),
    );

    recordApiMetric("GET /api/inventory/levels", 200, Date.now() - startedAt);
    return Response.json({ ok: true, levels });
  } catch (error) {
    recordApiMetric("GET /api/inventory/levels", 500, Date.now() - startedAt);
    return apiError("INVENTORY_LEVELS_FAILED", "Failed to read inventory levels", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
