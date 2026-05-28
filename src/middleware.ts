import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import { SESSION_COOKIE } from "@/lib/auth/session";

function getSecret() {
  const raw =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-session-secret-min-16-chars");
  return new TextEncoder().encode(raw);
}

type SessionClaims = {
  valid: boolean;
  onboardingComplete: boolean;
};

async function getSessionClaims(request: NextRequest): Promise<SessionClaims | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      valid: true,
      onboardingComplete: payload.onboardingComplete === true,
    };
  } catch {
    return { valid: false, onboardingComplete: false };
  }
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/signup") return true;
  if (pathname === "/onboarding") return true;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/signup") return true;
  if (pathname === "/api/auth/setup-status") return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

function isOnboardingExemptApi(pathname: string): boolean {
  return (
    pathname === "/api/onboarding" ||
    pathname === "/api/auth/me" ||
    pathname === "/api/auth/logout"
  );
}

function needsAuth(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthDisabled()) {
    if (pathname === "/login" || pathname === "/signup" || pathname === "/onboarding") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  const claims = await getSessionClaims(request);

  if (pathname === "/login" || pathname === "/signup") {
    if (claims?.valid) {
      const dest = claims.onboardingComplete ? "/admin" : "/onboarding";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/onboarding") {
    if (!claims?.valid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (claims.onboardingComplete) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (!needsAuth(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!claims?.valid) {
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

  if (!claims.onboardingComplete) {
    if (pathname.startsWith("/api/")) {
      if (isOnboardingExemptApi(pathname)) {
        return NextResponse.next();
      }
      return NextResponse.json(
        {
          ok: false,
          error: { code: "ONBOARDING_REQUIRED", message: "Complete onboarding first" },
        },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*", "/login", "/signup", "/onboarding"],
};
