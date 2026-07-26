import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { sumStockMovementMl } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

const getCachedInventoryLevels = unstable_cache(
  async (tenantId: string) => {
    const products = await prisma.product.findMany({
      where: { tenantId },
      include: {
        reorderConfig: true,
        stockMovements: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    return Promise.all(
      products.map(async (product) => {
        const sum = await prisma.stockMovement.aggregate({
          where: { productId: product.id },
          _sum: { quantityDeltaMl: true },
        });

        const currentMl = sumStockMovementMl(sum);
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
          lastMovement: product.stockMovements[0]
            ? {
                ...product.stockMovements[0],
                createdAt: product.stockMovements[0].createdAt.toISOString(),
              }
            : null,
        };
      }),
    );
  },
  ["inventory-levels"],
  { tags: ["inventory-levels"], revalidate: 5 },
);

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const levels = await getCachedInventoryLevels(session.tenantId);

    recordApiMetric("GET /api/inventory/levels", 200, Date.now() - startedAt);
    return Response.json({ ok: true, levels });
  } catch (error) {
    recordApiMetric("GET /api/inventory/levels", 500, Date.now() - startedAt);
    return apiError("INVENTORY_LEVELS_FAILED", "Failed to read inventory levels", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
