import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
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
import {
  findTenantByApprovalBatch,
  findTenantsByAdminPhone,
  formatVenuePicker,
  getVenueSession,
  parseVenueChoice,
  setVenueSession,
  type AdminTenant,
} from "@/lib/whatsapp/venue-session";

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

async function handleButtonAction(
  tenantId: string,
  to: string,
  action: "APPROVE_ALL" | "CANCEL",
  batchId: string,
): Promise<{ reason: string | null }> {
  try {
    if (action === "APPROVE_ALL") {
      const result = await confirmAwaitingOrders(tenantId, batchId);
      if (result.count === 0 && !result.already) {
        console.error("[whatsapp-webhook] batch not found", { tenantId, action, batchId });
        await sendText(to, "There's nothing waiting for approval right now.", tenantId);
        return { reason: "batch not found" };
      }
      if (result.already) {
        console.error("[whatsapp-webhook] batch already handled", {
          tenantId,
          action,
          batchId,
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

    const result = await cancelAwaitingOrders(tenantId, batchId);
    if (result.count === 0 && !result.already) {
      console.error("[whatsapp-webhook] batch not found", { tenantId, action, batchId });
      await sendText(to, "There's nothing waiting for approval right now.", tenantId);
      return { reason: "batch not found" };
    }
    if (result.already) {
      console.error("[whatsapp-webhook] batch already handled", {
        tenantId,
        action,
        batchId,
        already: result.already,
      });
      await sendText(to, `These orders were already ${result.already}.`, tenantId);
      return { reason: `already ${result.already}` };
    }
    const list = result.names.join(", ");
    await sendText(to, `Cancelled ${result.count} order${result.count === 1 ? "" : "s"}: ${list}.`, tenantId);
    return { reason: null };
  } catch (error) {
    console.error("[whatsapp-webhook] button action failed", { tenantId, action, batchId, error });
    return { reason: "action failed" };
  }
}

async function handleButtonTap(from: string, message: IncomingWhatsAppMessage, payload: string) {
  const parsed = parseApprovalPayload(payload);
  if (!parsed) {
    console.error("[whatsapp-webhook] skipped", { reason: "unknown payload", from, payload });
    await logInbound({
      tenantId: null,
      from,
      messageId: message.id,
      type: message.type ?? "button",
      reason: "unknown payload",
      status: "ignored",
    });
    return;
  }

  const tenant = await findTenantByApprovalBatch(parsed.batchId);
  if (!tenant) {
    console.error("[whatsapp-webhook] skipped", {
      reason: "batch not found",
      from,
      action: parsed.action,
      batchId: parsed.batchId,
    });
    await logInbound({
      tenantId: null,
      from,
      messageId: message.id,
      type: message.type ?? "button",
      reason: "batch not found",
      status: "ignored",
    });
    await sendText(from, "There's nothing waiting for approval right now.");
    return;
  }

  if (!whatsappPhonesMatch(tenant.adminWhatsappNumber, from)) {
    console.error("[whatsapp-webhook] skipped", {
      reason: "sender mismatch",
      from,
      tenantId: tenant.id,
      action: parsed.action,
      batchId: parsed.batchId,
    });
    await logInbound({
      tenantId: tenant.id,
      from,
      messageId: message.id,
      type: message.type ?? "button",
      reason: "sender mismatch",
      status: "ignored",
    });
    return;
  }

  const outcome = await handleButtonAction(tenant.id, from, parsed.action, parsed.batchId);
  await logInbound({
    tenantId: tenant.id,
    from,
    messageId: message.id,
    type: message.type ?? "button",
    reason: outcome.reason,
    status: outcome.reason ? "ignored" : "received",
  });
}

async function resolveTextTenant(
  from: string,
  textBody: string,
): Promise<{ tenant: AdminTenant | null; reason: string | null; pickerSent?: boolean; venueSelected?: boolean }> {
  const tenants = await findTenantsByAdminPhone(from);
  if (tenants.length === 0) {
    return { tenant: null, reason: "unknown sender" };
  }
  if (tenants.length === 1) {
    return { tenant: tenants[0]!, reason: null };
  }

  const choice = parseVenueChoice(textBody, tenants.length);
  if (choice) {
    const selected = tenants[choice - 1]!;
    await setVenueSession(from, selected.id);
    return { tenant: selected, reason: null, venueSelected: true };
  }

  const session = await getVenueSession(from);
  const sessionTenant = session ? tenants.find((t) => t.id === session.id) : null;
  if (sessionTenant) {
    return { tenant: sessionTenant, reason: null };
  }

  await sendText(from, formatVenuePicker(tenants));
  return { tenant: null, reason: "multiple venues", pickerSent: true };
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

    if (payload) {
      await handleButtonTap(from, message, payload);
      continue;
    }

    if (textBody) {
      const resolved = await resolveTextTenant(from, textBody);
      if (!resolved.tenant) {
        console.error("[whatsapp-webhook] skipped", {
          reason: resolved.reason,
          from,
          type,
        });
        await logInbound({
          tenantId: null,
          from,
          messageId: message.id,
          type,
          reason: resolved.reason,
          status: "ignored",
        });
        continue;
      }

      if (resolved.venueSelected) {
        await sendText(from, `Using ${resolved.tenant.name}.`, resolved.tenant.id);
        await logInbound({
          tenantId: resolved.tenant.id,
          from,
          messageId: message.id,
          type,
          reason: null,
        });
        continue;
      }

      const reason = "text ignored";
      console.error("[whatsapp-webhook] skipped", {
        reason,
        tenantId: resolved.tenant.id,
        from,
        type,
        length: textBody.length,
      });
      await logInbound({
        tenantId: resolved.tenant.id,
        from,
        messageId: message.id,
        type,
        reason,
        status: "ignored",
      });
      await sendText(
        from,
        "Thanks. Replies aren't supported yet, open BarTally for details.",
        resolved.tenant.id,
      );
      continue;
    }

    console.error("[whatsapp-webhook] skipped", { reason: "unknown payload", from, type });
    await logInbound({
      tenantId: null,
      from,
      messageId: message.id,
      type,
      reason: "unknown payload",
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
