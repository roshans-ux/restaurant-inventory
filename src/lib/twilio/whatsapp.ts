import twilio from "twilio";
import { normalizeIndianPhone } from "@/lib/phone-in";

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_WHATSAPP_FROM?.trim(),
  );
}

export function toWhatsAppAddress(storedNumber: string): string | null {
  const normalized = normalizeIndianPhone(storedNumber);
  if (normalized) return `whatsapp:${normalized}`;
  const compact = storedNumber.replace(/\s/g, "");
  if (!compact) return null;
  const withPlus = compact.startsWith("+") ? compact : `+91${compact.replace(/\D/g, "")}`;
  return `whatsapp:${withPlus}`;
}

export function fromTwilioWhatsApp(from: string): string {
  return from.replace(/^whatsapp:/i, "").replace(/\s/g, "");
}

export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken || !signature) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}

export async function sendTwilioWhatsApp(toAddress: string, body: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) return false;
  try {
    const client = twilio(accountSid, authToken);
    await client.messages.create({ from, to: toAddress, body });
    return true;
  } catch (error) {
    console.error("[twilio-whatsapp] send failed", error);
    return false;
  }
}

export function twimlMessage(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escaped}</Message>
</Response>`;
}
