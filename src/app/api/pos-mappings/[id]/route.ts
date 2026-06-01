import { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { recordDeletedMappingSlot } from "@/lib/pos-draft-mappings";
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
    });
    if (!existing) {
      return apiError("POS_MAPPING_NOT_FOUND", "Mapping not found", 404);
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
