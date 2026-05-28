import { prisma } from "@/lib/prisma";

export async function GET() {
  const userCount = await prisma.user.count();
  return Response.json({
    ok: true,
    userCount,
    signupEnabled: true,
    message:
      userCount === 0
        ? "No accounts yet — use Sign up to create the first venue."
        : `${userCount} account(s) exist — use Sign up or Sign in.`,
  });
}
