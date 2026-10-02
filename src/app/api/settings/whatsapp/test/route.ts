import { NextRequest } from "next/server";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { appendStockOrderLog } from "@/lib/stock-order-log";
import { isWhatsAppConfigured, sendTemplate, sendText, type WhatsAppSendResult } from "@/lib/whatsapp/client";
import { isWhatsAppEnabled } from "@/lib/whatsapp/enabled";
import { sendMorningDigestForTenant } from "@/lib/whatsapp/digest";
import { sendWeeklySlippageForTenant, weeklySlippageSummary } from "@/lib/whatsapp/slippage-weekly";
import { sendOrderApprovalTemplate, stampApprovalBatch } from "@/lib/whatsapp/templates";

const TEST_ORDER_NOTE = "whatsapp-test";
const OPEN_ORDER_STATUSES: StockOrderStatus[] = [
  StockOrderStatus.PENDING,
  StockOrderStatus.MODIFIED,
  StockOrderStatus.AWAITING_APPROVAL,
  StockOrderStatus.PLACED,
];

function failResult(result: WhatsAppSendResult) {
  if (result.ok) return null;
  if (result.templateNotApproved) {
    return apiError("WHATSAPP_TEMPLATE_NOT_APPROVED", result.error, 400);
  }
  return apiError("WHATSAPP_SEND_FAILED", result.error, 400);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

async function listApprovalCandidates(tenantId: string) {
  return prisma.stockOrder.findMany({
    where: {
      tenantId,
      status: {
        in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED, StockOrderStatus.AWAITING_APPROVAL],
      },
    },
    include: { product: { select: { name: true } } },
    take: 20,
  });
}

async function createWhatsAppTestOrders(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      vendorId: true,
      reorderConfig: { select: { reorderQuantity: true } },
    },
  });
  const blocked = await prisma.stockOrder.findMany({
    where: { tenantId, status: { in: OPEN_ORDER_STATUSES } },
    select: { productId: true },
  });
  const blockedIds = new Set(blocked.map((o) => o.productId));
  const available = shuffle(products.filter((p) => !blockedIds.has(p.id))).slice(0, 3);
  const created = [];
  for (const product of available) {
    const order = await prisma.stockOrder.create({
      data: {
        tenantId,
        productId: product.id,
        vendorId: product.vendorId,
        quantityBottles: Math.max(1, product.reorderConfig?.reorderQuantity ?? 1),
        status: StockOrderStatus.PENDING,
        notes: TEST_ORDER_NOTE,
      },
      include: { product: { select: { name: true } } },
    });
    await appendStockOrderLog(prisma, order.id, "Created for WhatsApp order_approval test");
    created.push(order);
  }
  return created;
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  if (!isWhatsAppEnabled() || !isWhatsAppConfigured()) {
    return apiError("WHATSAPP_NOT_CONFIGURED", "WhatsApp not configured", 400);
  }

  let template = "";
  let createTestOrders = false;
  try {
    const body = (await request.json()) as { template?: string; createTestOrders?: boolean };
    template = body.template?.trim() ?? "";
    createTestOrders = body.createTestOrders === true;
  } catch {
    return apiError("INVALID_JSON", "Invalid JSON", 400);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { name: true, adminWhatsappNumber: true },
  });
  if (!tenant?.adminWhatsappNumber) {
    return apiError("ADMIN_WHATSAPP_MISSING", "Save an Admin WhatsApp number first", 400);
  }

  if (template === "connected") {
    const send = await sendText(
      tenant.adminWhatsappNumber,
      `BarTally WhatsApp is connected for ${tenant.name}. You'll get morning updates and weekly slippage here.`,
      session.tenantId,
    );
    const fail = failResult(send);
    if (fail) return fail;
    return apiOk({ sent: true, delivered: true, template });
  }

  if (template === "morning_digest") {
    const result = await sendMorningDigestForTenant(session.tenantId);
    if (result.result && !result.result.ok) {
      const fail = failResult(result.result);
      if (fail) return fail;
    }
    if (!result.sent) {
      const send = await sendTemplate(
        tenant.adminWhatsappNumber,
        "morning_digest",
        [tenant.name, "None", "None"],
        [],
        session.tenantId,
      );
      const fail = failResult(send);
      if (fail) return fail;
    }
    return apiOk({ sent: true, template });
  }

  if (template === "weekly_slippage") {
    const result = await sendWeeklySlippageForTenant(session.tenantId);
    if (result.sent) return apiOk({ sent: true, template });
    const summary = await weeklySlippageSummary(session.tenantId);
    const send = await sendTemplate(
      tenant.adminWhatsappNumber,
      "weekly_slippage",
      [
        tenant.name,
        summary ? String(summary.totalMl) : "0",
        summary ? String(summary.bottleCount) : "0",
        summary ? String(summary.pegs) : "0",
        summary?.biggest ?? "None, 0 ml",
      ],
      [],
      session.tenantId,
    );
    const fail = failResult(send);
    if (fail) return fail;
    return apiOk({ sent: true, template });
  }

  if (template === "order_approval") {
    let pending = await listApprovalCandidates(session.tenantId);
    if (pending.length === 0 && createTestOrders) {
      pending = await createWhatsAppTestOrders(session.tenantId);
    }
    if (pending.length === 0) {
      return apiError("NO_PENDING_ORDERS", "No pending orders to test with", 400);
    }
    const batchId = await stampApprovalBatch(pending.map((o) => o.id));
    const send = await sendOrderApprovalTemplate({
      tenantId: session.tenantId,
      venueName: tenant.name,
      adminWhatsappNumber: tenant.adminWhatsappNumber,
      orders: pending,
      batchId,
    });
    const fail = failResult(send);
    if (fail) return fail;
    return apiOk({
      sent: true,
      template,
      createdTestOrders: createTestOrders,
    });
  }

  return apiError("UNKNOWN_TEMPLATE", "Unknown template", 400);
}
