import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const products = await prisma.product.findMany({
    where: { tenantId: session.tenantId },
    include: { reorderConfig: true },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    products.map(async (product) => {
      const sum = await prisma.stockMovement.aggregate({
        where: { productId: product.id },
        _sum: { quantityDeltaMl: true },
      });
      const currentMl = sum._sum.quantityDeltaMl ?? 0;
      const thresholdMl = product.reorderConfig
        ? Math.round(Number(product.reorderConfig.thresholdBottles) * Number(product.bottleSizeMl))
        : null;
      return {
        productId: product.id,
        name: product.name,
        currentMl,
        currentBottles: Number((currentMl / Number(product.bottleSizeMl)).toFixed(2)),
        thresholdMl,
        needsRecount: currentMl < 0 || (thresholdMl !== null && currentMl < thresholdMl),
      };
    }),
  );

  return apiOk({ rows });
}
