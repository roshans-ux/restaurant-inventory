import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth/tokens";

function htmlPage(title: string, body: string, ok: boolean) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Bar Inventory</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0e0e11; color: #f4f0e8; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; background: #1a1a1f; border: 1px solid #2a2a32; border-radius: 12px; padding: 32px; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 12px; }
    p { color: #a8a29e; font-size: 0.95rem; line-height: 1.5; margin: 0; }
    .ok { color: #4ade80; }
    .err { color: #f87171; }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="${ok ? "ok" : "err"}">${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return htmlPage(
      "Invalid link",
      "This approval link is missing a token. Use the link from your alert email or approve via Neon SQL.",
      false,
    );
  }

  const consumed = await consumeAuthToken(token, "ACCOUNT_APPROVAL");
  if (!consumed) {
    return htmlPage(
      "Link expired or invalid",
      "This approval link has already been used or has expired (7 days). Approve manually in Neon if needed.",
      false,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: consumed.userId },
    include: { tenant: true },
  });

  if (!user) {
    return htmlPage("User not found", "No account matches this approval token.", false);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  return htmlPage(
    "Account approved",
    `${user.email} (${user.tenant.name}) can sign in now. Contact them on ${user.phone} when ready.`,
    true,
  );
}
