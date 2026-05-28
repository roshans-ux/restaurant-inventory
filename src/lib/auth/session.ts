import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "bar_inventory_session";

export type SessionPayload = {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  tenantName: string;
  onboardingComplete: boolean;
};

function getSecret() {
  const raw =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-session-secret-min-16-chars");
  if (!raw || raw.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 characters)");
  }
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.tenantId || !payload.email) return null;
    return {
      sub: String(payload.sub),
      tenantId: String(payload.tenantId),
      email: String(payload.email),
      role: String(payload.role ?? "ADMIN"),
      tenantName: String(payload.tenantName ?? "Venue"),
      onboardingComplete: payload.onboardingComplete === true,
    };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
