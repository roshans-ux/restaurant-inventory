import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

export type BootstrapFailureReason =
  | "USERS_EXIST"
  | "BOOTSTRAP_NOT_CONFIGURED"
  | "CREDENTIALS_MISMATCH";

export function getBootstrapCredentials(): {
  email: string | null;
  password: string | null;
} {
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    (process.env.NODE_ENV !== "production" ? "admin@demo.local" : undefined)
  )
    ?.trim()
    .toLowerCase();
  const password = (
    process.env.BOOTSTRAP_ADMIN_PASSWORD ??
    (process.env.NODE_ENV !== "production" ? "changeme123" : undefined)
  )?.trim();

  return {
    email: email || null,
    password: password || null,
  };
}

export function bootstrapFailureMessage(reason: BootstrapFailureReason): string {
  switch (reason) {
    case "USERS_EXIST":
      return "An account already exists. Sign in with that email, or clear the User table in your database to bootstrap again.";
    case "BOOTSTRAP_NOT_CONFIGURED":
      return "First-time setup is not configured. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in your host environment, then redeploy.";
    case "CREDENTIALS_MISMATCH":
      return "No account found. On first login, use the exact email and password from BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (no extra spaces).";
  }
}

export async function bootstrapTenantIfEmpty(email: string, password: string) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return { user: null, reason: "USERS_EXIST" as const };
  }

  const { email: bootstrapEmail, password: bootstrapPassword } = getBootstrapCredentials();
  if (!bootstrapEmail || !bootstrapPassword) {
    return { user: null, reason: "BOOTSTRAP_NOT_CONFIGURED" as const };
  }
  if (email !== bootstrapEmail || password !== bootstrapPassword) {
    return { user: null, reason: "CREDENTIALS_MISMATCH" as const };
  }

  const tenantName = (process.env.BOOTSTRAP_TENANT_NAME ?? "My Venue").trim() || "My Venue";
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "venue";

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: `${slug}-${randomUUID().slice(0, 6)}`,
      posWebhookSecret: (process.env.POS_WEBHOOK_SECRET ?? "dev-secret").trim(),
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: bootstrapEmail,
      passwordHash: hashPassword(bootstrapPassword),
      name: "Owner",
      role: "OWNER",
    },
    include: { tenant: true },
  });

  return { user, reason: null };
}
