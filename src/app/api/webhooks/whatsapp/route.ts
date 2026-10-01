import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { afterResponse } from "@/lib/after-response";
import { cancelAwaitingOrders, confirmAwaitingOrders } from "@/lib/order-batch";
import { sendText } from "@/lib/whatsapp/client";
import {
  extractReplyPayload,
  parseApprovalPayload,
  type IncomingWhatsAppMessage,
} from "@/lib/whatsapp/inbound";
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

type IncomingStatus = {
  id?: string;
  status?: string;
  errors?: Array<{ message?: string }>;
};

function parseIncoming(json: unknown): { messages: IncomingWhatsAppMessage[]; statuses: IncomingStatus[] } {
  const messages: IncomingWhatsAppMessage[] = [];
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
      const value = (change as { value?: { messages?: IncomingWhatsAppMessage[]; statuses?: IncomingStatus[] } })
        .value;
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

async function logInbound(args: {
  tenantId: string | null;
  from: string;
  messageId: string;
  type: string;
  reason: string | null;
  status?: string;
}) {
  await logWhatsAppMessage({
    tenantId: args.tenantId,
    templateName: args.type,
    recipient: args.from,
    metaMessageId: args.messageId,
    direction: "in",
    status: args.status ?? "received",
    reason: args.reason,
  });
}

async function handleButton(
  tenantId: string,
  to: string,
  payload: string,
): Promise<{ reason: string | null }> {
  const parsed = parseApprovalPayload(payload);
  if (!parsed) {
    console.error("[whatsapp-webhook] unknown payload", { tenantId, payload });
    return { reason: "unknown payload" };
  }

  try {
    if (parsed.action === "APPROVE_ALL") {
      const result = await confirmAwaitingOrders(tenantId, parsed.batchId);
      if (result.count === 0 && !result.already) {
        console.error("[whatsapp-webhook] batch not found", {
          tenantId,
          action: parsed.action,
          batchId: parsed.batchId,
        });
        await sendText(to, "There's nothing waiting for approval right now.", tenantId);
        return { reason: "batch not found" };
      }
      if (result.already) {
        console.error("[whatsapp-webhook] batch already handled", {
          tenantId,
          action: parsed.action,
          batchId: parsed.batchId,
          already: result.already,
        });
        await sendText(to, `These orders were already ${result.already}.`, tenantId);
        return { reason: `already ${result.already}` };
      }
      const list = result.names.join(", ");
      await sendText(
        to,
        `Approved ${result.count} order${result.count === 1 ? "" : "s"}: ${list}. Vendors have been emailed.`,
        tenantId,
      );
      return { reason: null };
    }

    const result = await cancelAwaitingOrders(tenantId, parsed.batchId);
    if (result.count === 0 && !result.already) {
      console.error("[whatsapp-webhook] batch not found", {
        tenantId,
        action: parsed.action,
        batchId: parsed.batchId,
      });
      await sendText(to, "There's nothing waiting for approval right now.", tenantId);
      return { reason: "batch not found" };
    }
    if (result.already) {
      console.error("[whatsapp-webhook] batch already handled", {
        tenantId,
        action: parsed.action,
        batchId: parsed.batchId,
        already: result.already,
      });
      await sendText(to, `These orders were already ${result.already}.`, tenantId);
      return { reason: `already ${result.already}` };
    }
    const list = result.names.join(", ");
    await sendText(to, `Cancelled ${result.count} order${result.count === 1 ? "" : "s"}: ${list}.`, tenantId);
    return { reason: null };
  } catch (error) {
    console.error("[whatsapp-webhook] button action failed", {
      tenantId,
      action: parsed.action,
      batchId: parsed.batchId,
      error,
    });
    return { reason: "action failed" };
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
    const from = toWhatsAppDigits(message.from) ?? message.from.replace(/\D/g, "") ?? message.from;
    const type = message.type ?? "unknown";
    const payload = extractReplyPayload(message);
    const textBody = message.text?.body?.trim() ?? "";
    const tenant = await findTenantByAdminPhone(from);

    if (!tenant) {
      const reason = "unknown sender";
      console.error("[whatsapp-webhook] skipped", {
        reason,
        from,
        type,
        payload: payload || null,
      });
      await logInbound({
        tenantId: null,
        from,
        messageId: message.id,
        type,
        reason,
      });
      continue;
    }

    if (payload) {
      const outcome = await handleButton(tenant.id, from, payload);
      await logInbound({
        tenantId: tenant.id,
        from,
        messageId: message.id,
        type,
        reason: outcome.reason,
        status: outcome.reason ? "ignored" : "received",
      });
      continue;
    }

    if (textBody) {
      const reason = "text ignored";
      console.error("[whatsapp-webhook] skipped", {
        reason,
        tenantId: tenant.id,
        from,
        type,
        length: textBody.length,
      });
      await logInbound({
        tenantId: tenant.id,
        from,
        messageId: message.id,
        type,
        reason,
        status: "ignored",
      });
      await sendText(
        from,
        "Thanks. Replies aren't supported yet, open BarTally for details.",
        tenant.id,
      );
      continue;
    }

    const reason = "unknown payload";
    console.error("[whatsapp-webhook] skipped", {
      reason,
      tenantId: tenant.id,
      from,
      type,
    });
    await logInbound({
      tenantId: tenant.id,
      from,
      messageId: message.id,
      type,
      reason,
      status: "ignored",
    });
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
    console.error("[whatsapp-webhook] invalid JSON body");
    return new Response("ok", { status: 200 });
  }

  afterResponse(() => processWebhook(json), "whatsapp-webhook");
  return new Response("ok", { status: 200 });
}
