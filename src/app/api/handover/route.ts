import { NextRequest } from "next/server";
import { z } from "zod";
import { AlertType, BottleRotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { openRotation } from "@/lib/bottle-rotation";
import { mlRemainingForRotation } from "@/lib/slippage";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const rotations = await prisma.bottleRotation.findMany({
      where: { tenantId: session.tenantId, status: BottleRotationStatus.ACTIVE },
      include: { product: true },
      orderBy: { openedAt: "desc" },
    });

    const activeRotations = await Promise.all(
      rotations.map(async (r) => {
        const bottleSizeMl = Number(r.product.bottleSizeMl);
        const mlRemaining = await mlRemainingForRotation({
          productId: r.productId,
          bottleSizeMl,
          openedAt: r.openedAt,
        });
        return {
          id: r.id,
          productId: r.productId,
          productName: r.product.name,
          sku: r.product.sku,
          barcodeId: r.barcodeId,
          bottleSizeMl,
          openedAt: r.openedAt.toISOString(),
          mlRemaining,
        };
      }),
    );

    const slippageAlerts = await prisma.alert.findMany({
      where: {
        resolvedAt: null,
        type: AlertType.SLIPPAGE,
        product: { tenantId: session.tenantId },
      },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });

    return apiOk({ activeRotations, slippageAlerts });
  } catch (error) {
    return apiError("HANDOVER_FETCH_FAILED", "Failed to fetch handover data", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const postSchema = z.object({
  productId: z.string().uuid(),
  barcodeId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = postSchema.parse(await request.json());
    const rotation = await openRotation(
      session.tenantId,
      payload.productId,
      payload.barcodeId,
    );
    const bottleSizeMl = Number(rotation.product.bottleSizeMl);
    return apiOk({
      rotation: {
        id: rotation.id,
        productId: rotation.productId,
        productName: rotation.product.name,
        sku: rotation.product.sku,
        barcodeId: rotation.barcodeId,
        bottleSizeMl,
        openedAt: rotation.openedAt.toISOString(),
        mlRemaining: bottleSizeMl,
      },
    });
  } catch (error) {
    return apiError("HANDOVER_SCAN_FAILED", "Failed to open bottle rotation", 400, {
      message: error instanceof Error ? error.message : "Invalid request",
    });
  }
}
