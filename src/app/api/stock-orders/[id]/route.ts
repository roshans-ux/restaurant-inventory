import { NextRequest } from "next/server";
import { z } from "zod";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { buildCancelEmail, buildModifyEmail } from "@/lib/vendor-messages";
import { trySendVendorEmail } from "@/lib/email/vendor-order";
import { appendStockOrderLog } from "@/lib/stock-order-log";

const patchSchema = z.object({
  quantityBottles: z.number().int().positive().optional(),
  cancel: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

const EDITABLE_STATUSES = [
  StockOrderStatus.PENDING,
  StockOrderStatus.MODIFIED,
  StockOrderStatus.PLACED,
] as const;

const CANCELLABLE_STATUSES = [
  StockOrderStatus.PENDING,
  StockOrderStatus.MODIFIED,
  StockOrderStatus.PLACED,
] as const;

const orderInclude = {
  product: true,
  vendor: true,
  notifiedVendors: true,
  logs: { orderBy: { createdAt: "desc" as const } },
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { id } = await params;
    const payload = patchSchema.parse(await request.json());

    const existing = await prisma.stockOrder.findFirst({
      where: { id, tenantId: session.tenantId },
      include: {
        product: true,
        vendor: true,
        notifiedVendors: true,
      },
    });
    if (!existing) {
      return apiError("ORDER_NOT_FOUND", "Order not found", 404);
    }

    if (payload.cancel) {
      if (!CANCELLABLE_STATUSES.includes(existing.status as (typeof CANCELLABLE_STATUSES)[number])) {
        return apiError("ORDER_NOT_CANCELLABLE", "Order cannot be cancelled", 400);
      }

      const wasPlaced = existing.status === StockOrderStatus.PLACED;
      const order = await prisma.stockOrder.update({
        where: { id },
        data: { status: StockOrderStatus.CANCELLED, cancelledAt: new Date() },
        include: {
          product: true,
          vendor: true,
          notifiedVendors: true,
          logs: { orderBy: { createdAt: "desc" as const } },
        },
      });

      const emailWarnings: string[] = [];
      if (wasPlaced) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: { name: true },
        });
        const targets =
          order.notifiedVendors.length > 0
            ? order.notifiedVendors
            : order.vendor
              ? [order.vendor]
              : [];
        if (tenant && targets.length === 0) {
          await appendStockOrderLog(prisma, id, "Order cancelled");
        } else if (tenant) {
          for (const vendor of targets) {
            const email = vendor.email?.trim() ?? "";
            if (!email) {
              await appendStockOrderLog(
                prisma,
                id,
                `Order cancelled. No email sent — no email address on file for ${vendor.name}.`,
              );
              continue;
            }
            const sent = await trySendVendorEmail({
              to: email,
              subject: `Order Cancellation from ${tenant.name}`,
              text: buildCancelEmail(tenant.name, vendor.name, [order.product.name]),
            });
            if (sent) {
              await appendStockOrderLog(
                prisma,
                id,
                `Order cancelled. Cancellation email sent to: ${vendor.name} (${email})`,
              );
            } else {
              emailWarnings.push(
                `Order cancelled but email could not be sent to ${vendor.name}. Check their email address in Settings.`,
              );
              await appendStockOrderLog(
                prisma,
                id,
                `Order cancelled. Cancellation email could not be sent to: ${vendor.name} (${email})`,
              );
            }
          }
        } else {
          await appendStockOrderLog(prisma, id, "Order cancelled");
        }
      } else {
        await appendStockOrderLog(prisma, id, "Order cancelled");
      }

      return apiOk({
        order: await prisma.stockOrder.findFirst({
          where: { id, tenantId: session.tenantId },
          include: orderInclude,
        }),
        emailWarnings,
      });
    }

    if (payload.quantityBottles !== undefined) {
      if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
        return apiError("ORDER_NOT_EDITABLE", "Only pending or placed orders can be edited", 400);
      }
      const qtyChanged = payload.quantityBottles !== existing.quantityBottles;
      const wasPlaced = existing.status === StockOrderStatus.PLACED;
      const order = await prisma.stockOrder.update({
        where: { id },
        data: {
          quantityBottles: payload.quantityBottles,
          status: wasPlaced
            ? StockOrderStatus.PLACED
            : qtyChanged
              ? StockOrderStatus.MODIFIED
              : existing.status,
        },
        include: {
          product: true,
          vendor: true,
          notifiedVendors: true,
          logs: { orderBy: { createdAt: "desc" as const } },
        },
      });

      const emailWarnings: string[] = [];
      if (qtyChanged && wasPlaced) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: { name: true },
        });
        const targets =
          order.notifiedVendors.length > 0
            ? order.notifiedVendors
            : order.vendor
              ? [order.vendor]
              : [];
        if (tenant) {
          for (const vendor of targets) {
            const email = vendor.email?.trim() ?? "";
            if (!email) {
              await appendStockOrderLog(
                prisma,
                id,
                `Order modified. No email sent — no email address on file for ${vendor.name}.`,
              );
              continue;
            }
            const sent = await trySendVendorEmail({
              to: email,
              subject: `Order Update from ${tenant.name}`,
              text: buildModifyEmail(
                tenant.name,
                vendor.name,
                order.product.name,
                payload.quantityBottles,
              ),
            });
            if (sent) {
              await appendStockOrderLog(
                prisma,
                id,
                `Order modified. Update email sent to: ${vendor.name} (${email})`,
              );
            } else {
              emailWarnings.push(
                `Order updated but email could not be sent to ${vendor.name}. Check their email address in Settings.`,
              );
              await appendStockOrderLog(
                prisma,
                id,
                `Order modified. Update email could not be sent to: ${vendor.name} (${email})`,
              );
            }
          }
        }
      } else if (qtyChanged) {
        await appendStockOrderLog(
          prisma,
          id,
          `Quantity updated to ${payload.quantityBottles} bottles`,
        );
      }
      return apiOk({
        order: await prisma.stockOrder.findFirst({
          where: { id, tenantId: session.tenantId },
          include: orderInclude,
        }),
        emailWarnings,
      });
    }

    return apiError("NO_CHANGES", "No changes specified", 400);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_REQUEST", "Invalid request", 400);
    }
    return apiError("ORDER_UPDATE_FAILED", "Failed to update order", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
