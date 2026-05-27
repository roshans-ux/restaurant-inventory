import { NextRequest } from "next/server";
import { getApiMetrics, getUptimeMs } from "@/lib/observability";
import { apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  return apiOk({
    uptimeMs: getUptimeMs(),
    routes: getApiMetrics(),
  });
}
