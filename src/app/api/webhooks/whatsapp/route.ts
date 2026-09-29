import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { afterResponse } from "@/lib/after-response";
import { cancelAwaitingOrders, confirmAwaitingOrders } from "@/lib/order-batch";
import { sendText } from "@/lib/whatsapp/client";
import { logWhatsAppMessage, updateWhatsAppStatus } from "@/lib/whatsapp/log";
import { toWhatsAppDigits, whatsappPhonesMatch } from "@/lib/whatsapp/phone";

function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

type IncomingMessage = {
  from: string;
  id: string;
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
};

type IncomingStatus = {
  id?: string;
  status?: string;
  errors?: Array<{ message?: string }>;
};

function parseIncoming(json: unknown): { messages: IncomingMessage[]; statuses: IncomingStatus[] } {
  const messages: IncomingMessage[] = [];
  const statuses: IncomingStatus[] = [];
  if (!json || typeof json !== "object") return { messages, statuses };
  const entries = (json as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return { messages, statuses };
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: { messages?: IncomingMessage[]; statuses?: IncomingStatus[] } }).value;
      if (Array.isArray(value?.messages)) messages.push(...value.messages);
      if (Array.isArray(value?.statuses)) statuses.push(...value.statuses);
    }
  }
  return { messages, statuses };
}

async function findTenantByAdminPhone(from: string) {
  const tenants = await prisma.tenant.findMany({
    where: { adminWhatsappNumber: { not: null } },
    select: { id: true, adminWhatsappNumber: true },
  });
  return tenants.find((t) => whatsappPhonesMatch(t.adminWhatsappNumber, from)) ?? null;
}

async function handleButton(tenantId: string, to: string, payload: string) {
  const [action, batchId] = payload.split(":");
  if (!batchId) return;
  if (action === "APPROVE_ALL") {
    const result = await confirmAwaitingOrders(tenantId, batchId);
    if (result.already) {
      await sendText(to, `These orders were already ${result.already}.`, tenantId);
      return;
    }
    if (result.count === 0) {
      await sendText(to, "No pending orders to approve.", tenantId);
      return;
    }
    const list = result.names.join(", ");
    await sendText(to, `Approved ${result.count} order${result.count === 1 ? "" : "s"}: ${list}. Vendors have been emailed.`, tenantId);
    return;
  }
  if (action === "CANCEL") {
    const result = await cancelAwaitingOrders(tenantId, batchId);
    if (result.already) {
      await sendText(to, `These orders were already ${result.already}.`, tenantId);
      return;
    }
    if (result.count === 0) {
      await sendText(to, "No pending orders to cancel.", tenantId);
      return;
    }
    const list = result.names.join(", ");
    await sendText(to, `Cancelled ${result.count} order${result.count === 1 ? "" : "s"}: ${list}.`, tenantId);
  }
}

async function processWebhook(json: unknown) {
  const { messages, statuses } = parseIncoming(json);
  for (const status of statuses) {
    if (!status.id || !status.status) continue;
    const err = status.errors?.[0]?.message ?? null;
    await updateWhatsAppStatus(status.id, status.status, err);
  }

  for (const message of messages) {
    const from = toWhatsAppDigits(message.from) ?? message.from;
    const tenant = await findTenantByAdminPhone(message.from);
    const payload = message.interactive?.button_reply?.id ?? "";
    const textBody = message.text?.body?.trim() ?? "";

    if (message.type === "interactive" && payload) {
      if (!tenant) continue;
      await logWhatsAppMessage({
        tenantId: tenant.id,
        templateName: "button",
        recipient: from,
        metaMessageId: message.id,
        direction: "in",
        status: "received",
      });
      await handleButton(tenant.id, from, payload);
      continue;
    }

    if (textBody) {
      await logWhatsAppMessage({
        tenantId: tenant?.id ?? null,
        templateName: "text",
        recipient: from,
        metaMessageId: message.id,
        direction: "in",
        status: "received",
      });
      console.info("[whatsapp] inbound text from admin number", {
        tenantId: tenant?.id ?? null,
        length: textBody.length,
      });
      if (tenant) {
        await sendText(
          from,
          "Thanks. Replies aren't supported yet, open BarTally for details.",
          tenant.id,
        );
      }
    }
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(raw, signature)) {
    return new Response("Invalid signature", { status: 403 });
  }

  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return new Response("ok", { status: 200 });
  }

  afterResponse(() => processWebhook(json), "whatsapp-webhook");
  return new Response("ok", { status: 200 });
}
