import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/auth/session";

function getSecret() {
  const raw =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-session-secret-min-16-chars");
  return new TextEncoder().encode(raw);
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

function needsAuth(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!needsAuth(pathname) || isPublicPath(pathname)) {
    if (pathname === "/login") {
      const token = request.cookies.get(SESSION_COOKIE)?.value;
      if (token) {
        try {
          await jwtVerify(token, getSecret());
          return NextResponse.redirect(new URL("/admin", request.url));
        } catch {
          // invalid session cookie — show login
        }
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Sign in required" } },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Session expired" } },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*", "/login"],
};
