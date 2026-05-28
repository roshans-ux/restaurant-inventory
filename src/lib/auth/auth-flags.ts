/** Env-only check — safe for Edge middleware (no Prisma). */
export function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH === "true";
}
