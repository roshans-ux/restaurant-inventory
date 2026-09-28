import { NextRequest } from "next/server";
import { checkRestockForTenant } from "@/lib/restock-check";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const result = await checkRestockForTenant(session.tenantId);
    return apiOk(result);
  } catch (error) {
    return apiError(
      "RESTOCK_CHECK_FAILED",
      error instanceof Error ? error.message : "Restock check failed",
      500,
    );
  }
}
