import { NextRequest } from "next/server";
import { z } from "zod";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  buildCancelEmail,
  buildOrderEmail,
} from "@/lib/vendor-messages";
import { trySendVendorEmail } from "@/lib/email/vendor-order";
import { appendStockOrderLog } from "@/lib/stock-order-log";

const orderInclude = {
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      vendors: { select: { id: true, name: true, email: true } },
    },
  },
  vendor: { select: { id: true, name: true, whatsappNumber: true, email: true } },
  notifiedVendors: { select: { id: true, name: true, whatsappNumber: true, email: true } },
  logs: { orderBy: { createdAt: "desc" as const } },
};

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const statusFilter = request.nextUrl.searchParams.get("status");
  const where: {
    tenantId: string;
    status?:
      | StockOrderStatus
      | { not: StockOrderStatus }
      | { in: StockOrderStatus[] };
  } = { tenantId: session.tenantId };

  if (statusFilter === "pending") {
    where.status = { in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED] };
  } else if (statusFilter === "placed") {
    where.status = StockOrderStatus.PLACED;
  } else if (statusFilter === "cancelled") {
    where.status = StockOrderStatus.CANCELLED;
  } else if (statusFilter === "all") {
    // no status filter — include every status
  } else {
    where.status = { not: StockOrderStatus.CANCELLED };
  }

  try {
    const orders = await prisma.stockOrder.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    return apiOk({ orders });
  } catch (error) {
    return apiError("STOCK_ORDERS_FETCH_FAILED", "Failed to fetch stock orders", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

const bulkSchema = z.object({
  action: z.enum(["place", "cancel"]),
  orderIds: z.array(z.string().uuid()).min(1),
  assignments: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        vendorIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = bulkSchema.parse(await request.json());
    const [tenant, orders] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { name: true },
      }),
      prisma.stockOrder.findMany({
        where: {
          id: { in: payload.orderIds },
          tenantId: session.tenantId,
          status:
            payload.action === "place"
              ? { in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED] }
              : {
                  in: [
                    StockOrderStatus.PENDING,
                    StockOrderStatus.MODIFIED,
                    StockOrderStatus.PLACED,
                  ],
                },
        },
        include: {
          product: {
            include: { vendors: { select: { id: true, name: true, email: true } } },
          },
          vendor: true,
          notifiedVendors: true,
        },
      }),
    ]);
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    if (orders.length === 0) {
      return apiError("NO_ORDERS", "No eligible orders found", 400);
    }

    const now = new Date();
    const emailWarnings: string[] = [];

    if (payload.action === "place") {
      if (!payload.assignments || payload.assignments.length === 0) {
        return apiError("VENDORS_REQUIRED", "Select vendors for each SKU", 400);
      }
      const assignmentByOrder = new Map(
        payload.assignments.map((a) => [a.orderId, a.vendorIds]),
      );

      const allVendorIds = [...new Set(payload.assignments.flatMap((a) => a.vendorIds))];
      const vendorRows = await prisma.vendor.findMany({
        where: { tenantId: session.tenantId, id: { in: allVendorIds } },
      });
      const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

      for (const order of orders) {
        const vendorIds = assignmentByOrder.get(order.id);
        if (!vendorIds || vendorIds.length === 0) {
          return apiError("VENDORS_REQUIRED", `Select vendors for ${order.product.name}`, 400);
        }
        const assigned = new Set(order.product.vendors.map((v) => v.id));
        for (const vid of vendorIds) {
          if (!vendorById.has(vid)) {
            return apiError("INVALID_VENDOR", "Vendor not found", 400);
          }
          if (assigned.size > 0 && !assigned.has(vid)) {
            return apiError(
              "VENDOR_NOT_ASSIGNED",
              `${vendorById.get(vid)?.name ?? "Vendor"} is not assigned to ${order.product.name}`,
              400,
            );
          }
        }
      }

      const skuNamesByVendor = new Map<string, Set<string>>();

      await prisma.$transaction(async (tx) => {
        for (const order of orders) {
          const vendorIds = assignmentByOrder.get(order.id)!;
          await tx.stockOrder.update({
            where: { id: order.id },
            data: {
              status: StockOrderStatus.PLACED,
              placedAt: now,
              vendorId: vendorIds[0] ?? null,
              notifiedVendors: { set: vendorIds.map((id) => ({ id })) },
            },
          });
          for (const vid of vendorIds) {
            const set = skuNamesByVendor.get(vid) ?? new Set();
            set.add(order.product.name);
            skuNamesByVendor.set(vid, set);
          }
        }
      });

      const sendResultByVendor = new Map<string, "sent" | "missing" | "failed">();
      for (const [vendorId, skuNames] of skuNamesByVendor) {
        const vendor = vendorById.get(vendorId);
        if (!vendor) continue;
        const email = vendor.email?.trim() ?? "";
        if (!email) {
          sendResultByVendor.set(vendorId, "missing");
          continue;
        }
        const sent = await trySendVendorEmail({
          to: email,
          subject: `New Order from ${tenant.name}`,
          text: buildOrderEmail(tenant.name, vendor.name, [...skuNames]),
        });
        sendResultByVendor.set(vendorId, sent ? "sent" : "failed");
        if (!sent) {
          emailWarnings.push(
            `Order placed but email could not be sent to ${vendor.name}. Check their email address in Settings.`,
          );
        }
      }

      await prisma.$transaction(async (tx) => {
        for (const order of orders) {
          const vendorIds = assignmentByOrder.get(order.id)!;
          for (const vid of vendorIds) {
            const vendor = vendorById.get(vid);
            if (!vendor) continue;
            const result = sendResultByVendor.get(vid);
            const email = vendor.email?.trim() ?? "";
            if (result === "sent") {
              await appendStockOrderLog(
                tx,
                order.id,
                `Order placed. Email sent to: ${vendor.name} (${email})`,
              );
            } else if (result === "failed") {
              await appendStockOrderLog(
                tx,
                order.id,
                `Order placed. No email sent — email could not be sent to ${vendor.name} (${email}).`,
              );
            } else {
              await appendStockOrderLog(
                tx,
                order.id,
                `Order placed. No email sent — no email address on file for ${vendor.name}.`,
              );
            }
          }
        }
      });

      return apiOk({
        updatedCount: orders.length,
        notifiedCount: [...sendResultByVendor.values()].filter((r) => r === "sent").length,
        emailWarnings,
      });
    }

    const placedOrders = orders.filter((o) => o.status === StockOrderStatus.PLACED);

    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        await tx.stockOrder.update({
          where: { id: order.id },
          data: { status: StockOrderStatus.CANCELLED, cancelledAt: now },
        });
      }
    });

    const placedByVendor = new Map<
      string,
      {
        vendor: { id: string; name: string; email: string | null };
        lines: typeof placedOrders;
      }
    >();

    for (const order of placedOrders) {
      const targets =
        order.notifiedVendors.length > 0
          ? order.notifiedVendors
          : order.vendor
            ? [order.vendor]
            : [];
      for (const vendor of targets) {
        const group = placedByVendor.get(vendor.id) ?? { vendor, lines: [] };
        group.lines.push(order);
        placedByVendor.set(vendor.id, group);
      }
    }

    const cancelResultByVendor = new Map<string, "sent" | "missing" | "failed">();
    for (const { vendor, lines } of placedByVendor.values()) {
      const email = vendor.email?.trim() ?? "";
      if (!email) {
        cancelResultByVendor.set(vendor.id, "missing");
        continue;
      }
      const sent = await trySendVendorEmail({
        to: email,
        subject: `Order Cancellation from ${tenant.name}`,
        text: buildCancelEmail(
          tenant.name,
          vendor.name,
          [...new Set(lines.map((o) => o.product.name))],
        ),
      });
      cancelResultByVendor.set(vendor.id, sent ? "sent" : "failed");
      if (!sent) {
        emailWarnings.push(
          `Order cancelled but email could not be sent to ${vendor.name}. Check their email address in Settings.`,
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const order of orders) {
        if (order.status !== StockOrderStatus.PLACED) {
          await appendStockOrderLog(tx, order.id, "Order cancelled");
          continue;
        }
        const targets =
          order.notifiedVendors.length > 0
            ? order.notifiedVendors
            : order.vendor
              ? [order.vendor]
              : [];
        if (targets.length === 0) {
          await appendStockOrderLog(tx, order.id, "Order cancelled");
          continue;
        }
        for (const vendor of targets) {
          const result = cancelResultByVendor.get(vendor.id);
          const email = vendor.email?.trim() ?? "";
          if (result === "sent") {
            await appendStockOrderLog(
              tx,
              order.id,
              `Order cancelled. Cancellation email sent to: ${vendor.name} (${email})`,
            );
          } else if (result === "failed") {
            await appendStockOrderLog(
              tx,
              order.id,
              `Order cancelled. Cancellation email could not be sent to: ${vendor.name} (${email})`,
            );
          } else {
            await appendStockOrderLog(
              tx,
              order.id,
              `Order cancelled. No email sent — no email address on file for ${vendor.name}.`,
            );
          }
        }
      }
    });

    return apiOk({
      updatedCount: orders.length,
      notifiedCount: placedOrders.length,
      emailWarnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_REQUEST", "Invalid request", 400);
    }
    return apiError("STOCK_ORDERS_BULK_FAILED", "Bulk action failed", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
