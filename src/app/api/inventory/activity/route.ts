import { NextRequest } from "next/server";
import { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const activity = await prisma.stockMovement.findMany({
      where: {
        product: { tenantId: session.tenantId },
        type: { in: [StockMovementType.RECEIVE, StockMovementType.ADJUSTMENT] },
      },
      include: { product: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return apiOk({ activity });
  } catch (error) {
    return apiError("INVENTORY_ACTIVITY_FAILED", "Failed to fetch stock activity", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
