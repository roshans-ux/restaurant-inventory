import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { revalidateForecastCache } from "@/lib/forecast/cache";
import { POS_SALE_SOURCE_IMPORT } from "@/lib/sales-import/types";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  const { id } = await context.params;

  const batch = await prisma.salesImportBatch.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!batch) {
    return apiError("IMPORT_NOT_FOUND", "That import batch was not found", 404);
  }

  await prisma.$transaction([
    prisma.posSale.deleteMany({
      where: { tenantId: session.tenantId, importBatchId: id, source: POS_SALE_SOURCE_IMPORT },
    }),
    prisma.salesImportBatch.delete({ where: { id } }),
  ]);
  revalidateForecastCache(session.tenantId);
  return apiOk({ deleted: true, id });
}
