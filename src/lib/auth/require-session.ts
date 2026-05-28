import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { getBypassSession, isAuthDisabled } from "@/lib/auth/auth-disabled";
import { getSessionFromCookies, getSessionFromRequest, type SessionPayload } from "@/lib/auth/session";

export async function requirePageSession(): Promise<SessionPayload> {
  if (isAuthDisabled()) {
    const bypass = await getBypassSession();
    if (bypass) return bypass;
    throw new Error("UNAUTHORIZED");
  }
  const session = await getSessionFromCookies();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireApiSession(
  request: NextRequest,
): Promise<SessionPayload | Response> {
  if (isAuthDisabled()) {
    const bypass = await getBypassSession();
    if (bypass) return bypass;
    return apiError(
      "UNAUTHORIZED",
      "Auth is disabled but the database has no tenant. Run npm run seed or log in once with bootstrap credentials.",
      401,
    );
  }
  const session = await getSessionFromRequest(request);
  if (!session) {
    return apiError("UNAUTHORIZED", "Sign in required", 401);
  }
  return session;
}

export function isSession(payload: SessionPayload | Response): payload is SessionPayload {
  return !(payload instanceof Response);
}
