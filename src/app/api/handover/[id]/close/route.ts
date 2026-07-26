import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { closeBottleRotation } from "@/lib/slippage";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { id } = await params;
    const result = await closeBottleRotation(id, session.tenantId);
    revalidateTag("inventory-levels", { expire: 0 });
    return apiOk({
      rotationId: id,
      slippageMl: result.slippageMl,
      slippagePercent: result.slippagePercent,
      saleMlOrdered: result.saleMlOrdered,
    });
  } catch (error) {
    return apiError("HANDOVER_CLOSE_FAILED", "Failed to close bottle rotation", 400, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
