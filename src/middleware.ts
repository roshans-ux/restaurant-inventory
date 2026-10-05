import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import { SESSION_COOKIE } from "@/lib/auth/session";

const SESSION_DB_CHECK_MAX_AGE_SECONDS = 60 * 60 * 24;

function getSecret() {
  const raw =
    process.env.SESSION_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "dev-session-secret-min-16-chars");
  return new TextEncoder().encode(raw);
}

type SessionClaims = {
  valid: boolean;
  onboardingComplete: boolean;
  emailVerified: boolean;
  cancelled: boolean;
  iat: number;
};

async function getSessionClaims(request: NextRequest): Promise<SessionClaims | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      valid: true,
      onboardingComplete: payload.onboardingComplete === true,
      emailVerified: payload.emailVerified === true,
      cancelled: payload.cancelled === true,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch {
    return { valid: false, onboardingComplete: false, emailVerified: false, cancelled: false, iat: 0 };
  }
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/pending-approval" ||
    pathname === "/account-cancelled" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    return true;
  }
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/signup" ||
    pathname === "/api/auth/setup-status" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/api/auth/refresh-session" ||
    pathname === "/api/auth/approval-status" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/admin/approve"
  ) {
    return true;
  }
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  return false;
}

function isApprovalExempt(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname === "/pending-approval" ||
    pathname === "/account-cancelled" ||
    pathname === "/api/onboarding" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/approval-status" ||
    pathname === "/api/auth/me"
  );
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

function skipSessionDbCheck(pathname: string): boolean {
  return pathname === "/api/auth/refresh-session" || pathname === "/api/auth/logout";
}

function refreshSessionUrl(request: NextRequest): URL {
  const { pathname, search } = request.nextUrl;
  const next = pathname.startsWith("/api/") ? "/admin" : `${pathname}${search}`;
  const url = new URL("/api/auth/refresh-session", request.url);
  url.searchParams.set("next", next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
  return url;
}

export async function middleware(request: NextRequest) {
  const hostHeader =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    "";
  const host = hostHeader.split(":")[0].toLowerCase();
  if (host === "restaurant-inventory-sand.vercel.app") {
    const dest = new URL(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      "https://bartally.in",
    );
    return NextResponse.redirect(dest, 308);
  }

  const { pathname } = request.nextUrl;

  if (isAuthDisabled()) {
    if (
      pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/onboarding" ||
      pathname === "/pending-approval" ||
      pathname === "/account-cancelled" ||
      pathname === "/forgot-password" ||
      pathname === "/reset-password"
    ) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  const claims = await getSessionClaims(request);

  if (claims?.valid && !skipSessionDbCheck(pathname)) {
    const ageSeconds = Math.floor(Date.now() / 1000) - claims.iat;
    if (claims.iat <= 0 || ageSeconds > SESSION_DB_CHECK_MAX_AGE_SECONDS) {
      return NextResponse.redirect(refreshSessionUrl(request));
    }
  }

  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    if (claims?.valid && claims.cancelled) {
      return NextResponse.redirect(new URL("/account-cancelled", request.url));
    }
    if (claims?.valid && claims.emailVerified) {
      const dest = claims.onboardingComplete ? "/admin" : "/onboarding";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    if (claims?.valid && claims.onboardingComplete && !claims.emailVerified) {
      return NextResponse.redirect(new URL("/pending-approval", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/onboarding") {
    if (!claims?.valid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (claims.cancelled) {
      return NextResponse.redirect(new URL("/account-cancelled", request.url));
    }
    if (claims.onboardingComplete) {
      return NextResponse.redirect(
        new URL(claims.emailVerified ? "/admin" : "/pending-approval", request.url),
      );
    }
    return NextResponse.next();
  }

  if (pathname === "/pending-approval") {
    if (!claims?.valid) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (claims.cancelled) {
      return NextResponse.redirect(new URL("/account-cancelled", request.url));
    }
    if (claims.emailVerified) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (!claims.onboardingComplete) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/account-cancelled") {
    if (!claims?.valid) {
      return NextResponse.redirect(new URL("/login", request.url));
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

  if (claims.cancelled) {
    if (isApprovalExempt(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "ACCOUNT_CANCELLED", message: "This account has been cancelled" },
        },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/account-cancelled", request.url));
  }

  if (!claims.emailVerified && claims.onboardingComplete) {
    if (isApprovalExempt(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "PENDING_APPROVAL", message: "Account awaiting approval" },
        },
        { status: 403 },
      );
    }
    return NextResponse.redirect(new URL("/pending-approval", request.url));
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
