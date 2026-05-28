import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { createAuthToken } from "@/lib/auth/tokens";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { verificationEmailContent } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";
import { getSessionFromRequest } from "@/lib/auth/session";

const schema = z.object({
  email: z.string().email().optional(),
});

async function sendVerificationForEmail(request: NextRequest, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) {
    const raw = await createAuthToken(user.id, "EMAIL_VERIFICATION");
    const verifyUrl = `${getAppBaseUrl(request)}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
    const content = verificationEmailContent(verifyUrl);
    await sendEmail({ to: user.email, ...content });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const session = await getSessionFromRequest(request);
    const email =
      body.email?.toLowerCase().trim() ?? session?.email?.toLowerCase().trim();

    if (email) {
      await sendVerificationForEmail(request, email);
    }

    return apiOk({ sent: true });
  } catch (error) {
    console.error("[auth/resend-verification]", error);
    return apiError("RESEND_FAILED", "Could not send verification email", 500);
  }
}
