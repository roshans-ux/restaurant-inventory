import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { consumeAuthToken } from "@/lib/auth/tokens";

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string().min(8),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.parse(await request.json());
    const consumed = await consumeAuthToken(parsed.token, "PASSWORD_RESET");

    if (!consumed) {
      return apiError(
        "INVALID_RESET_TOKEN",
        "This reset link is invalid or has expired. Request a new one.",
        400,
      );
    }

    await prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash: hashPassword(parsed.password) },
    });

    return apiOk({ message: "Password updated. You can sign in now." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return apiError("INVALID_RESET", issue?.message ?? "Invalid data", 400, { field });
    }
    console.error("[auth/reset-password]", error);
    return apiError("RESET_FAILED", "Could not reset password", 500);
  }
}
