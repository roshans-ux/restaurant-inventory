import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { getCurrentStockMl, isBelowThreshold } from "@/lib/inventory";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findAlertForTenant } from "@/lib/tenant";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const { id } = await params;
  const alert = await findAlertForTenant(session.tenantId, id);

  if (!alert) {
    return apiError("ALERT_NOT_FOUND", "Alert not found", 404);
  }

  if (alert.resolvedAt) {
    return apiOk({ alert });
  }

  const config = await prisma.reorderConfig.findUnique({
    where: { productId: alert.productId },
  });
  if (config && alert.product) {
    const currentMl = await getCurrentStockMl(alert.productId);
    const belowThreshold = isBelowThreshold(
      currentMl,
      Number(config.thresholdBottles),
      Number(alert.product.bottleSizeMl),
    );
    if (belowThreshold) {
      return apiError(
        "ALERT_REQUIRES_RESTOCK",
        "This alert cannot be resolved until stock is above threshold.",
        409,
      );
    }
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  return apiOk({ alert: updated });
}
