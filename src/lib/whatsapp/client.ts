import { isTwilioConfigured, sendTwilioWhatsApp, toWhatsAppAddress } from "@/lib/twilio/whatsapp";
import { isWhatsAppEnabled } from "@/lib/whatsapp/enabled";
import { isMetaWhatsAppConfigured, metaSendTemplate, metaSendText, type WhatsAppSendResult } from "@/lib/whatsapp/meta";
import { toWhatsAppDigits } from "@/lib/whatsapp/phone";

export { isWhatsAppEnabled } from "@/lib/whatsapp/enabled";

export type { WhatsAppSendResult };

export function whatsappProvider(): "meta" | "twilio" {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === "twilio" ? "twilio" : "meta";
}

export function isWhatsAppConfigured(): boolean {
  return whatsappProvider() === "twilio" ? isTwilioConfigured() : isMetaWhatsAppConfigured();
}

export async function sendText(to: string, body: string, tenantId?: string | null): Promise<WhatsAppSendResult> {
  if (!isWhatsAppEnabled()) {
    return { ok: false, error: "WhatsApp not configured", templateNotApproved: false };
  }
  if (whatsappProvider() === "twilio") {
    const address = toWhatsAppAddress(to);
    if (!address) return { ok: false, error: "Invalid WhatsApp number", templateNotApproved: false };
    const ok = await sendTwilioWhatsApp(address, body);
    return ok
      ? { ok: true, messageId: "" }
      : { ok: false, error: "Twilio WhatsApp send failed", templateNotApproved: false };
  }
  return metaSendText({ tenantId, to, body });
}

export async function sendTemplate(
  to: string,
  templateName: string,
  params: string[],
  buttonPayloads?: Array<string | null | undefined>,
  tenantId?: string | null,
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppEnabled()) {
    return { ok: false, error: "WhatsApp not configured", templateNotApproved: false };
  }
  if (whatsappProvider() === "twilio") {
    const body = `${templateName}: ${params.join(" · ")}`;
    return sendText(to, body, tenantId);
  }
  return metaSendTemplate({ tenantId, to, templateName, params, buttonPayloads });
}

export type AdminReorderPrompt = {
  tenantId: string;
  stockOrderId: string;
  adminWhatsappNumber: string | null;
  venueName: string;
  productName: string;
  quantityBottles: number;
  vendorName: string | null;
};

export type VendorOrderMessage = {
  vendorWhatsappNumber: string | null;
  body: string;
};

export async function sendAdminReorderPrompt(payload: AdminReorderPrompt): Promise<void> {
  if (!isWhatsAppEnabled() || !isWhatsAppConfigured() || !payload.adminWhatsappNumber) return;
  console.info("[whatsapp] admin prompt deferred to batch window", { stockOrderId: payload.stockOrderId });
}

export async function sendVendorOrder(payload: VendorOrderMessage): Promise<void> {
  if (!isWhatsAppEnabled() || !isWhatsAppConfigured()) return;
  if (!payload.vendorWhatsappNumber || payload.vendorWhatsappNumber === "—") return;
  const to = toWhatsAppDigits(payload.vendorWhatsappNumber);
  if (!to) return;
  await sendText(to, payload.body);
}
