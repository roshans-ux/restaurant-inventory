import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { createAuthToken } from "@/lib/auth/tokens";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { passwordResetEmailContent, verificationEmailContent } from "@/lib/email/messages";
import { sendEmail } from "@/lib/email/send";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest) {
  try {
    const { email } = schema.parse(await request.json());
    const normalized = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (user) {
      if (!user.emailVerifiedAt) {
        const raw = await createAuthToken(user.id, "EMAIL_VERIFICATION");
        const verifyUrl = `${getAppBaseUrl(request)}/api/auth/verify-email?token=${encodeURIComponent(raw)}`;
        const content = verificationEmailContent(verifyUrl);
        await sendEmail({ to: user.email, ...content });
      } else {
        const raw = await createAuthToken(user.id, "PASSWORD_RESET");
        const resetUrl = `${getAppBaseUrl(request)}/reset-password?token=${encodeURIComponent(raw)}`;
        const content = passwordResetEmailContent(resetUrl);
        await sendEmail({ to: user.email, ...content });
      }
    }

    return apiOk({
      message: "If an account exists for that email, we sent a reset link.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_EMAIL", "Enter a valid email address", 400);
    }
    console.error("[auth/forgot-password]", error);
    return apiError("FORGOT_PASSWORD_FAILED", "Could not process request", 500);
  }
}
