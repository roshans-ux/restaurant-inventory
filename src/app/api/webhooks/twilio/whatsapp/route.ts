import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeIndianPhone } from "@/lib/phone-in";
import {
  classifyOwnerReply,
  cancelAwaitingOrders,
  confirmAwaitingOrders,
} from "@/lib/order-batch";
import {
  fromTwilioWhatsApp,
  twimlMessage,
  validateTwilioSignature,
} from "@/lib/twilio/whatsapp";

function webhookUrl(request: NextRequest): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) return `${appUrl}/api/webhooks/twilio/whatsapp`;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    "";
  return `${proto}://${host}/api/webhooks/twilio/whatsapp`;
}

function formParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

function twiml(text: string) {
  return new Response(twimlMessage(text), {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

async function findTenantByWhatsApp(from: string) {
  const raw = fromTwilioWhatsApp(from);
  const normalized = normalizeIndianPhone(raw) ?? raw;
  return prisma.tenant.findFirst({
    where: {
      OR: [{ adminWhatsappNumber: normalized }, { adminWhatsappNumber: raw }],
    },
    select: { id: true, adminWhatsappNumber: true },
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const params = formParams(form);
  const signature = request.headers.get("X-Twilio-Signature");
  const url = webhookUrl(request);
  if (!validateTwilioSignature(signature, url, params)) {
    const alt = request.url.split("?")[0];
    if (alt !== url && !validateTwilioSignature(signature, alt, params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  }

  const body = params.Body ?? "";
  const from = params.From ?? "";
  const tenant = await findTenantByWhatsApp(from);
  const kind = classifyOwnerReply(body);

  const unrecognized =
    "Sorry, I didn't understand that. Reply CONFIRM to send the order or CANCEL to discard it.";
  const confirmed = "Order confirmed. Your vendors have been notified by email.";
  const cancelled = "Order cancelled. No emails have been sent to your vendors.";

  let reply = unrecognized;
  if (tenant && kind === "confirm") {
    await confirmAwaitingOrders(tenant.id);
    reply = confirmed;
  } else if (tenant && kind === "cancel") {
    await cancelAwaitingOrders(tenant.id);
    reply = cancelled;
  }

  return twiml(reply);
}
