import { logWhatsAppMessage } from "@/lib/whatsapp/log";
import { toWhatsAppDigits } from "@/lib/whatsapp/phone";
import { sanitizeTemplateVar } from "@/lib/whatsapp/sanitize";

const GRAPH_VERSION = "v25.0";

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; templateNotApproved: boolean };

function accessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.WHATSAPP_TOKEN?.trim() || "";
}

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(accessToken() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
}

export function isTemplateNotApprovedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not approved") ||
    lower.includes("template name does not exist") ||
    lower.includes("template is paused") ||
    lower.includes("template is disabled") ||
    lower.includes("(#132001)") ||
    lower.includes("error code 132001")
  );
}

function graphErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const err = (payload as { error?: { message?: string; error_user_msg?: string; code?: number } }).error;
  if (!err) return fallback;
  const parts = [err.error_user_msg, err.message].filter((p): p is string => Boolean(p?.trim()));
  const text = parts[0] || fallback;
  if (typeof err.code === "number") return `${text} (code ${err.code})`;
  return text;
}

async function graphSend(
  body: Record<string, unknown>,
  log: { tenantId?: string | null; templateName?: string | null; recipient: string },
): Promise<WhatsAppSendResult> {
  const token = accessToken();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) {
    return { ok: false, error: "WhatsApp Cloud API is not configured", templateNotApproved: false };
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const error = graphErrorMessage(json, `WhatsApp send failed (${res.status})`);
    const templateNotApproved = isTemplateNotApprovedError(error);
    console.error("[whatsapp-meta] send failed", { status: res.status, error });
    await logWhatsAppMessage({
      tenantId: log.tenantId,
      templateName: log.templateName,
      recipient: log.recipient,
      direction: "out",
      status: "failed",
      error,
    });
    return { ok: false, error, templateNotApproved };
  }

  const messageId =
    json && typeof json === "object" && Array.isArray((json as { messages?: { id?: string }[] }).messages)
      ? (json as { messages?: { id?: string }[] }).messages?.[0]?.id ?? ""
      : "";

  await logWhatsAppMessage({
    tenantId: log.tenantId,
    templateName: log.templateName,
    recipient: log.recipient,
    metaMessageId: messageId || null,
    direction: "out",
    status: "sent",
  });
  return { ok: true, messageId };
}

export async function metaSendText(args: {
  tenantId?: string | null;
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const to = toWhatsAppDigits(args.to);
  if (!to) return { ok: false, error: "Invalid WhatsApp number", templateNotApproved: false };
  return graphSend(
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: args.body, preview_url: false },
    },
    { tenantId: args.tenantId, templateName: "text", recipient: to },
  );
}

export async function metaSendTemplate(args: {
  tenantId?: string | null;
  to: string;
  templateName: string;
  params: string[];
  buttonPayloads?: Array<string | null | undefined>;
}): Promise<WhatsAppSendResult> {
  const to = toWhatsAppDigits(args.to);
  if (!to) return { ok: false, error: "Invalid WhatsApp number", templateNotApproved: false };

  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: args.params.map((text) => ({ type: "text", text: sanitizeTemplateVar(text) })),
    },
  ];

  (args.buttonPayloads ?? []).forEach((payload, index) => {
    if (!payload) return;
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(index),
      parameters: [{ type: "payload", payload }],
    });
  });

  return graphSend(
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: args.templateName,
        language: { code: "en" },
        components,
      },
    },
    { tenantId: args.tenantId, templateName: args.templateName, recipient: to },
  );
}
