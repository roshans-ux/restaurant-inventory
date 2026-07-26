import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { syncDraftMappingsForTenant } from "@/lib/pos-draft-mappings";
import { recordApiMetric } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    await syncDraftMappingsForTenant(session.tenantId);
    recordApiMetric("POST /api/pos-mappings/sync-drafts", 200, Date.now() - startedAt);
    return apiOk({ synced: true });
  } catch (error) {
    console.error("POS mapping draft sync failed:", error);
    recordApiMetric("POST /api/pos-mappings/sync-drafts", 500, Date.now() - startedAt);
    return apiError(
      "POS_DRAFT_SYNC_FAILED",
      error instanceof Error ? error.message : "Draft mapping sync failed",
      500,
    );
  }
}
