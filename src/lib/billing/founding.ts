import type { Prisma } from "@prisma/client";

export class FoundingCodeError extends Error {
  constructor(
    public readonly code: "FOUNDING_CODE_INVALID" | "FOUNDING_CODE_FULL",
    message: string,
  ) {
    super(message);
    this.name = "FoundingCodeError";
  }
}

function foundingEnv() {
  const code = process.env.FOUNDING_CODE?.trim() ?? "";
  const limitRaw = process.env.FOUNDING_LIMIT?.trim() ?? "";
  const limit = Number.parseInt(limitRaw, 10);
  return {
    code,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
  };
}

/**
 * Valid if the submitted code matches FOUNDING_CODE (case-insensitive) and
 * fewer than FOUNDING_LIMIT tenants already have a foundingCode set.
 * Must run inside the same transaction that creates the tenant.
 */
export async function claimFoundingCode(
  tx: Prisma.TransactionClient,
  submitted: string | undefined,
): Promise<{ used: boolean; storedCode: string | null }> {
  const trimmed = submitted?.trim() ?? "";
  if (!trimmed) {
    return { used: false, storedCode: null };
  }

  const { code, limit } = foundingEnv();
  if (!code || limit <= 0 || trimmed.toLowerCase() !== code.toLowerCase()) {
    throw new FoundingCodeError("FOUNDING_CODE_INVALID", "That founding bar code is not valid.");
  }

  const usedCount = await tx.tenant.count({
    where: { foundingCode: { not: null } },
  });
  if (usedCount >= limit) {
    throw new FoundingCodeError(
      "FOUNDING_CODE_FULL",
      "That founding bar code is no longer available.",
    );
  }

  return { used: true, storedCode: code };
}
