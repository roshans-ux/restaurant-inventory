import { Resend } from "resend";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = { ok: true; dev?: boolean };

export function getEmailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ?? "Bar Inventory <onboarding@resend.dev>"
  );
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = getEmailFrom();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.warn("[email] RESEND_API_KEY not set — logging message to console");
    console.warn({ from, to: input.to, subject: input.subject, text: input.text });
    return { ok: true, dev: true };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}
