import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import { afterResponse } from "@/lib/after-response";
import { evaluateLowStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { syncPaymentReminders } from "@/lib/payment-reminders";

const receiveSchema = z.object({
  productId: z.string().uuid(),
  quantityBottles: z.number().positive(),
  bottleSizeMl: z.number().positive().optional(),
  reason: z.string().default("Stock received"),
  vendorId: z.string().uuid(),
  fulfilmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function addCalendarDays(isoDate: string, days: number): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = receiveSchema.parse(await request.json());
    const product = await prisma.product.findFirst({
      where: { id: parsed.productId, tenantId: session.tenantId },
      include: { vendors: { select: { id: true, creditPeriodDays: true } } },
    });

    if (!product) {
      recordApiMetric("POST /api/inventory/receive", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const vendor = await prisma.vendor.findFirst({
      where: { id: parsed.vendorId, tenantId: session.tenantId },
      select: { id: true, creditPeriodDays: true },
    });
    if (!vendor) {
      recordApiMetric("POST /api/inventory/receive", 400, Date.now() - startedAt);
      return apiError("VENDOR_NOT_FOUND", "Vendor not found", 400);
    }
    const assignedIds = product.vendors.map((v) => v.id);
    if (assignedIds.length > 0 && !assignedIds.includes(vendor.id)) {
      recordApiMetric("POST /api/inventory/receive", 400, Date.now() - startedAt);
      return apiError("VENDOR_NOT_ASSIGNED", "Vendor is not assigned to this bottle", 400);
    }

    const bottleSizeMl = parsed.bottleSizeMl ?? Number(product.bottleSizeMl);
    const deltaMl = Math.round(parsed.quantityBottles * bottleSizeMl);
    const fulfilmentDate = addCalendarDays(parsed.fulfilmentDate, 0);
    const creditDays = vendor.creditPeriodDays;
    const paymentDueAt =
      creditDays != null ? addCalendarDays(parsed.fulfilmentDate, creditDays) : null;

    const movement = await prisma.stockMovement.create({
      data: {
        productId: parsed.productId,
        vendorId: vendor.id,
        type: StockMovementType.RECEIVE,
        quantityDeltaMl: deltaMl,
        quantityInput: parsed.quantityBottles,
        quantityUnit: QuantityUnit.BOTTLE,
        reason: parsed.reason,
        fulfilmentDate,
        paymentDueAt,
        metadata: {
          source: "ADMIN_UI",
          operation: "RECEIVE_STOCK",
        },
      },
    });

    revalidateTag("inventory-levels", { expire: 0 });
    afterResponse(() => evaluateLowStock(parsed.productId), "inventory/receive low-stock");
    if (paymentDueAt) {
      afterResponse(
        () => syncPaymentReminders(session.tenantId),
        "inventory/receive payment-reminders",
      );
    }
    recordApiMetric("POST /api/inventory/receive", 201, Date.now() - startedAt);
    return apiOk({ movement }, 201);
  } catch (error) {
    recordApiMetric("POST /api/inventory/receive", 400, Date.now() - startedAt);
    return apiError(
      "RECEIVE_STOCK_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
