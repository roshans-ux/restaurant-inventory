import { prisma } from "@/lib/prisma";

function envPresent(key: string, minLength = 1): boolean {
  const v = process.env[key]?.trim();
  return !!v && v.length >= minLength;
}

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const userCount = await prisma.user.count();
  const unverifiedCount = await prisma.user.count({
    where: { emailVerifiedAt: null },
  });

  const config = {
    databaseUrl: envPresent("DATABASE_URL", 10),
    sessionSecret: envPresent("SESSION_SECRET", 16),
    appUrl: envPresent("APP_URL", 8),
    resendApiKey: envPresent("RESEND_API_KEY", 8),
    emailFrom: envPresent("EMAIL_FROM", 5),
    posWebhookSecret: envPresent("POS_WEBHOOK_SECRET", 4),
    googleSheetsWebhook: envPresent("GOOGLE_SHEETS_WEBHOOK_URL", 10),
  };

  const productionReady =
    dbOk &&
    config.databaseUrl &&
    config.sessionSecret &&
    config.appUrl &&
    config.resendApiKey &&
    config.emailFrom;

  return Response.json({
    ok: true,
    productionReady,
    db: dbOk ? "connected" : "error",
    userCount,
    unverifiedCount,
    signupEnabled: true,
    config,
    hints: [
      !config.appUrl && "Set APP_URL to your Vercel URL and redeploy.",
      !config.resendApiKey && "Set RESEND_API_KEY for verification and password reset emails.",
      unverifiedCount > 0 &&
        "Run Neon SQL: UPDATE \"User\" SET \"emailVerifiedAt\" = NOW() WHERE \"emailVerifiedAt\" IS NULL;",
      !config.googleSheetsWebhook &&
        "GOOGLE_SHEETS_WEBHOOK_URL optional — onboarding saves without Sheet sync.",
    ].filter(Boolean),
    message:
      userCount === 0
        ? "No accounts yet — use Sign up to create the first venue."
        : `${userCount} account(s); ${unverifiedCount} unverified.`,
  });
}
