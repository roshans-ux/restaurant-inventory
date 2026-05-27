import type { NextRequest } from "next/server";
import { apiError } from "@/lib/http";
import { getSessionFromCookies, getSessionFromRequest, type SessionPayload } from "@/lib/auth/session";

export async function requirePageSession(): Promise<SessionPayload> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireApiSession(
  request: NextRequest,
): Promise<SessionPayload | Response> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return apiError("UNAUTHORIZED", "Sign in required", 401);
  }
  return session;
}

export function isSession(payload: SessionPayload | Response): payload is SessionPayload {
  return !(payload instanceof Response);
}
