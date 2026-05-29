import { createHash, randomBytes } from "node:crypto";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EMAIL_VERIFICATION_HOURS = 24;
const PASSWORD_RESET_HOURS = 1;
const ACCOUNT_APPROVAL_DAYS = 7;

export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRawToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expiresAtForType(type: AuthTokenType): Date {
  if (type === "ACCOUNT_APPROVAL") {
    return new Date(Date.now() + ACCOUNT_APPROVAL_DAYS * 24 * 60 * 60 * 1000);
  }
  const hours = type === "EMAIL_VERIFICATION" ? EMAIL_VERIFICATION_HOURS : PASSWORD_RESET_HOURS;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const raw = generateRawToken();
  const tokenHash = hashRawToken(raw);

  await prisma.authToken.deleteMany({ where: { userId, type } });
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt: expiresAtForType(type),
    },
  });

  return raw;
}

export async function consumeAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<{ userId: string } | null> {
  const tokenHash = hashRawToken(rawToken);
  const record = await prisma.authToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.type !== type || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.authToken.delete({ where: { id: record.id } });
  return { userId: record.userId };
}
