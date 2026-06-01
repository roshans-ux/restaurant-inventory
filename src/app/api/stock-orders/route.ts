import { NextRequest } from "next/server";
import { z } from "zod";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  buildCancelTxt,
  buildModifyTxt,
  buildOrderTxt,
  txtFilename,
} from "@/lib/vendor-messages";

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
      include: {
        product: { select: { id: true, name: true, sku: true } },
        vendor: { select: { id: true, name: true, whatsappNumber: true } },
      },
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
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = bulkSchema.parse(await request.json());
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { name: true },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    const orders = await prisma.stockOrder.findMany({
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
        product: true,
        vendor: true,
      },
    });

    if (orders.length === 0) {
      return apiError("NO_ORDERS", "No eligible orders found", 400);
    }

    const now = new Date();
    const byVendor = new Map<
      string,
      { vendor: { id: string; name: string; whatsappNumber: string }; lines: typeof orders }
    >();

    for (const order of orders) {
      const vendor = order.vendor ?? {
        id: "unassigned",
        name: "Unassigned Vendor",
        whatsappNumber: "—",
      };
      const key = vendor.id;
      const group = byVendor.get(key) ?? { vendor, lines: [] };
      group.lines.push(order);
      byVendor.set(key, group);
    }

    const files: { filename: string; content: string; vendorName: string }[] = [];

    if (payload.action === "place") {
      await prisma.stockOrder.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { status: StockOrderStatus.PLACED, placedAt: now },
      });

      for (const { vendor, lines } of byVendor.values()) {
        const content = buildOrderTxt(
          { name: tenant.name },
          { name: vendor.name },
          lines.map((o) => ({
            productName: o.product.name,
            quantityBottles: o.quantityBottles,
          })),
        );
        files.push({
          filename: txtFilename("order", vendor.name),
          content,
          vendorName: vendor.name,
        });
      }
    } else {
      const placedOrders = orders.filter((o) => o.status === StockOrderStatus.PLACED);

      await prisma.stockOrder.updateMany({
        where: { id: { in: orders.map((o) => o.id) } },
        data: { status: StockOrderStatus.CANCELLED, cancelledAt: now },
      });

      const placedByVendor = new Map<
        string,
        { vendor: { id: string; name: string; whatsappNumber: string }; lines: typeof placedOrders }
      >();

      for (const order of placedOrders) {
        const vendor = order.vendor ?? {
          id: "unassigned",
          name: "Unassigned Vendor",
          whatsappNumber: "—",
        };
        const key = vendor.id;
        const group = placedByVendor.get(key) ?? { vendor, lines: [] };
        group.lines.push(order);
        placedByVendor.set(key, group);
      }

      for (const { vendor, lines } of placedByVendor.values()) {
        const content = buildCancelTxt(
          { name: tenant.name },
          { name: vendor.name },
          lines.map((o) => ({
            productName: o.product.name,
            quantityBottles: o.quantityBottles,
          })),
        );
        files.push({
          filename: txtFilename("cancel", vendor.name),
          content,
          vendorName: vendor.name,
        });
      }

      return apiOk({
        files,
        updatedCount: orders.length,
        notifiedCount: placedOrders.length,
      });
    }

    return apiOk({ files, updatedCount: orders.length, notifiedCount: orders.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_REQUEST", "Invalid request", 400);
    }
    return apiError("STOCK_ORDERS_BULK_FAILED", "Bulk action failed", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
