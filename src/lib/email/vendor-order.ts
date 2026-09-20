import { sendEmail } from "@/lib/email/send";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  return `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
}

export async function trySendVendorEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  try {
    await sendEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: textToHtml(input.text),
    });
    return true;
  } catch (error) {
    console.error("[vendor-email]", error);
    return false;
  }
}
