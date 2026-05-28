/**
 * Env-only check — safe for Edge middleware (no Prisma).
 * NEXT_PUBLIC_* is required on Netlify so middleware sees the flag at build/runtime.
 */
export function isAuthDisabled(): boolean {
  return (
    process.env.DISABLE_AUTH === "true" ||
    process.env.NEXT_PUBLIC_DISABLE_AUTH === "true"
  );
}
