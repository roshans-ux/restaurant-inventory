import { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { recordDeletedMappingSlot } from "@/lib/pos-draft-mappings";
import { isBeerBottleSize } from "@/lib/product-naming";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  const { id } = await context.params;
  try {
    const existing = await prisma.posMenuMapping.findFirst({
      where: { id, tenantId: session.tenantId },
      include: { product: true },
    });
    if (!existing) {
      return apiError("POS_MAPPING_NOT_FOUND", "Mapping not found", 404);
    }

    const bottleSizeMl = Number(existing.product.bottleSizeMl);
    if (isBeerBottleSize(bottleSizeMl) && Number(existing.pourMl) === bottleSizeMl) {
      return apiError(
        "BEER_MAPPING_PROTECTED",
        "Beer full-bottle mappings cannot be deleted — update the POS Item ID instead",
        409,
      );
    }

    const { productId, pourMl } = existing;
    await prisma.posMenuMapping.delete({ where: { id } });
    await recordDeletedMappingSlot(
      prisma,
      session.tenantId,
      productId,
      Number(pourMl),
    );
    recordApiMetric("DELETE /api/pos-mappings/[id]", 200, Date.now() - startedAt);
    return Response.json({ ok: true });
  } catch (error) {
    recordApiMetric("DELETE /api/pos-mappings/[id]", 500, Date.now() - startedAt);
    return apiError(
      "POS_MAPPING_DELETE_FAILED",
      error instanceof Error ? error.message : "Failed to delete",
      500,
    );
  }
}
