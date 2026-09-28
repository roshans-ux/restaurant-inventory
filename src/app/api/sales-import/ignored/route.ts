import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { loadTenantCatalog, persistIgnoredNames } from "@/lib/sales-import/http";

const patchSchema = z.object({
  remove: z.string().min(1),
});

export async function PATCH(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  let parsed;
  try {
    parsed = patchSchema.parse(await request.json());
  } catch {
    return apiError("INVALID_BODY", "Provide the ignored name to remove", 400);
  }
  const catalog = await loadTenantCatalog(session.tenantId);
  const next = catalog.ignoredNames.filter((n) => n !== parsed.remove.trim().toLowerCase());
  await persistIgnoredNames(session.tenantId, next);
  return apiOk({ ignoredNames: next });
}
