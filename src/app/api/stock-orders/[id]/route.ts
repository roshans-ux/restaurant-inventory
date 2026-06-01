import { NextRequest } from "next/server";
import { z } from "zod";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { buildCancelTxt, txtFilename } from "@/lib/vendor-messages";

const patchSchema = z.object({
  quantityBottles: z.number().int().positive().optional(),
  cancel: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

const EDITABLE_STATUSES = [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED] as const;

const CANCELLABLE_STATUSES = [
  StockOrderStatus.PENDING,
  StockOrderStatus.MODIFIED,
  StockOrderStatus.PLACED,
] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { id } = await params;
    const payload = patchSchema.parse(await request.json());

    const existing = await prisma.stockOrder.findFirst({
      where: { id, tenantId: session.tenantId },
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
        },
      });

      if (wasPlaced) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: { name: true },
        });
        if (tenant && order.vendor) {
          const content = buildCancelTxt(
            { name: tenant.name },
            { name: order.vendor.name },
            [{ productName: order.product.name, quantityBottles: order.quantityBottles }],
          );
          return apiOk({
            order,
            file: {
              filename: txtFilename("cancel", order.vendor.name),
              content,
            },
          });
        }
      }

      return apiOk({ order });
    }

    if (payload.quantityBottles !== undefined) {
      if (!EDITABLE_STATUSES.includes(existing.status as (typeof EDITABLE_STATUSES)[number])) {
        return apiError("ORDER_NOT_EDITABLE", "Only pending orders can be edited", 400);
      }
      const order = await prisma.stockOrder.update({
        where: { id },
        data: {
          quantityBottles: payload.quantityBottles,
          status:
            payload.quantityBottles !== existing.quantityBottles
              ? StockOrderStatus.MODIFIED
              : StockOrderStatus.PENDING,
        },
        include: { product: true, vendor: true },
      });
      return apiOk({ order });
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
