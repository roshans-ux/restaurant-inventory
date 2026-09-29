import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { isWhatsAppConfigured, sendTemplate, type WhatsAppSendResult } from "@/lib/whatsapp/client";
import { sendMorningDigestForTenant } from "@/lib/whatsapp/digest";
import { sendWeeklySlippageForTenant, weeklySlippageSummary } from "@/lib/whatsapp/slippage-weekly";
import { sendOrderApprovalTemplate, skuQtyLine, stampApprovalBatch } from "@/lib/whatsapp/templates";
import { joinTruncated } from "@/lib/whatsapp/sanitize";
import { StockOrderStatus } from "@prisma/client";

function failResult(result: WhatsAppSendResult) {
  if (result.ok) return null;
  if (result.templateNotApproved) {
    return apiError("WHATSAPP_TEMPLATE_NOT_APPROVED", result.error, 400);
  }
  return apiError("WHATSAPP_SEND_FAILED", result.error, 400);
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  if (!isWhatsAppConfigured()) {
    return apiError("WHATSAPP_NOT_CONFIGURED", "WhatsApp Cloud API is not connected", 400);
  }

  let template = "";
  try {
    const body = (await request.json()) as { template?: string };
    template = body.template?.trim() ?? "";
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
    const pending = await prisma.stockOrder.findMany({
      where: {
        tenantId: session.tenantId,
        status: {
          in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED, StockOrderStatus.AWAITING_APPROVAL],
        },
      },
      include: { product: { select: { name: true } } },
      take: 20,
    });
    const items = pending.length
      ? pending
      : [{ product: { name: "No items due" }, quantityBottles: 0 }];
    const batchId = pending.length ? await stampApprovalBatch(pending.map((o) => o.id)) : "test";
    const send = await sendOrderApprovalTemplate({
      tenantId: session.tenantId,
      venueName: tenant.name,
      adminWhatsappNumber: tenant.adminWhatsappNumber,
      orders: items,
      batchId,
    });
    const fail = failResult(send);
    if (fail) return fail;
    return apiOk({ sent: true, template, itemLine: joinTruncated(items.map((o) => skuQtyLine(o.product.name, o.quantityBottles))) });
  }

  return apiError("UNKNOWN_TEMPLATE", "Unknown template", 400);
}
