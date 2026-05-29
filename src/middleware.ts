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
  emailVerified: boolean;
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
    };
  } catch {
    return { valid: false, onboardingComplete: false, emailVerified: false };
  }
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/pending-approval" ||
    pathname === "/verify-email" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    return true;
  }
  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/signup" ||
    pathname === "/api/auth/setup-status" ||
    pathname === "/api/auth/verify-email" ||
    pathname === "/api/auth/resend-verification" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/api/admin/approve"
  ) {
    return true;
  }
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

function isEmailVerificationExempt(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname === "/pending-approval" ||
    pathname === "/verify-email" ||
    pathname === "/api/auth/verify-email" ||
    pathname === "/api/auth/resend-verification" ||
    pathname === "/api/onboarding" ||
    pathname === "/api/auth/logout" ||
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAuthDisabled()) {
    if (
      pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/onboarding" ||
      pathname === "/pending-approval" ||
      pathname === "/verify-email" ||
      pathname === "/forgot-password" ||
      pathname === "/reset-password"
    ) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  const claims = await getSessionClaims(request);

  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    if (claims?.valid && claims.emailVerified) {
      const dest = claims.onboardingComplete ? "/admin" : "/onboarding";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    if (claims?.valid && claims.onboardingComplete && !claims.emailVerified) {
      return NextResponse.redirect(new URL("/pending-approval", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/verify-email") {
    if (claims?.valid && claims.emailVerified) {
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
    if (claims.emailVerified) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    if (!claims.onboardingComplete) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
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

  if (!claims.emailVerified) {
    if (isEmailVerificationExempt(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: claims.onboardingComplete ? "PENDING_APPROVAL" : "EMAIL_NOT_VERIFIED",
            message: claims.onboardingComplete
              ? "Account awaiting approval"
              : "Verify your email to continue",
          },
        },
        { status: 403 },
      );
    }
    return NextResponse.redirect(
      new URL(claims.onboardingComplete ? "/pending-approval" : "/verify-email", request.url),
    );
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
    "/admin/:path*",
    "/api/:path*",
    "/login",
    "/signup",
    "/onboarding",
    "/pending-approval",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
  ],
};
