import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOrderTxt } from "@/lib/vendor-messages";
import { sendVendorOrder } from "@/lib/whatsapp/client";

export async function placeStockOrderFromWhatsApp(stockOrderId: string): Promise<
  | { ok: true; alreadyHandled?: boolean }
  | { ok: false; reason: string }
> {
  const order = await prisma.stockOrder.findUnique({
    where: { id: stockOrderId },
    include: {
      product: true,
      vendor: true,
      tenant: { select: { name: true } },
    },
  });
  if (!order) return { ok: false, reason: "ORDER_NOT_FOUND" };

  if (order.status === StockOrderStatus.PLACED) {
    return { ok: true, alreadyHandled: true };
  }
  if (order.status === StockOrderStatus.CANCELLED) {
    return { ok: true, alreadyHandled: true };
  }
  if (
    order.status !== StockOrderStatus.PENDING &&
    order.status !== StockOrderStatus.MODIFIED
  ) {
    return { ok: false, reason: "ORDER_NOT_PLACEABLE" };
  }

  await prisma.stockOrder.update({
    where: { id: order.id },
    data: { status: StockOrderStatus.PLACED, placedAt: new Date() },
  });

  if (order.vendor) {
    const body = buildOrderTxt(
      { name: order.tenant.name },
      { name: order.vendor.name },
      [{ productName: order.product.name, quantityBottles: order.quantityBottles }],
    );
    await sendVendorOrder({
      vendorWhatsappNumber: order.vendor.whatsappNumber,
      body,
    });
  }

  return { ok: true };
}

export async function cancelStockOrderFromWhatsApp(stockOrderId: string): Promise<
  | { ok: true; alreadyHandled?: boolean }
  | { ok: false; reason: string }
> {
  const order = await prisma.stockOrder.findUnique({
    where: { id: stockOrderId },
  });
  if (!order) return { ok: false, reason: "ORDER_NOT_FOUND" };
  if (order.status === StockOrderStatus.CANCELLED) {
    return { ok: true, alreadyHandled: true };
  }

  await prisma.stockOrder.update({
    where: { id: order.id },
    data: { status: StockOrderStatus.CANCELLED, cancelledAt: new Date() },
  });
  return { ok: true };
}
