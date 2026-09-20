import { AlertType, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatIstDate } from "@/lib/format-app-date";
import { formatProductNameWithSize } from "@/lib/product-naming";

function dueDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export async function syncPaymentReminders(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { paymentReminderDays: true },
  });
  const reminderDays = Math.min(30, Math.max(1, tenant?.paymentReminderDays ?? 3));
  const now = new Date();

  const movements = await prisma.stockMovement.findMany({
    where: {
      type: StockMovementType.RECEIVE,
      paymentDueAt: { not: null },
      vendorId: { not: null },
      product: { tenantId },
    },
    include: {
      vendor: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, bottleSizeMl: true } },
    },
  });

  type Group = {
    vendorId: string;
    vendorName: string;
    due: Date;
    fulfilment: Date | null;
    products: { id: string; name: string; bottleSizeMl: number }[];
  };
  const groups = new Map<string, Group>();

  for (const m of movements) {
    if (!m.paymentDueAt || !m.vendor) continue;
    const remindFrom = new Date(m.paymentDueAt);
    remindFrom.setDate(remindFrom.getDate() - reminderDays);
    if (now < remindFrom) continue;
    const key = `${m.vendor.id}:${dueDateKey(m.paymentDueAt)}`;
    const existing = groups.get(key);
    const product = {
      id: m.product.id,
      name: m.product.name,
      bottleSizeMl: Number(m.product.bottleSizeMl),
    };
    if (existing) {
      if (!existing.products.some((p) => p.id === product.id)) existing.products.push(product);
    } else {
      groups.set(key, {
        vendorId: m.vendor.id,
        vendorName: m.vendor.name,
        due: m.paymentDueAt,
        fulfilment: m.fulfilmentDate,
        products: [product],
      });
    }
  }

  for (const [key, group] of groups) {
    const referenceKey = `pay:${tenantId}:${key}`;
    const existing = await prisma.alert.findUnique({ where: { referenceKey } });
    if (existing) continue;

    const msLeft = group.due.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    const skuLabel = group.products
      .map((p) => formatProductNameWithSize(p.name, p.bottleSizeMl))
      .join(", ");
    const fulfilmentLabel = group.fulfilment ? formatIstDate(group.fulfilment) : "—";
    const dueLabel = formatIstDate(group.due);
    const message = `${group.vendorName} payment due in ${daysLeft} day${daysLeft === 1 ? "" : "s"} for ${skuLabel} delivery on ${fulfilmentLabel}. Due date: ${dueLabel}.`;

    await prisma.alert.create({
      data: {
        productId: group.products[0].id,
        type: AlertType.PAYMENT_REMINDER,
        message,
        referenceKey,
      },
    });
  }
}
