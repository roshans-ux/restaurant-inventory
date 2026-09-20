import { buildOrderEmail } from "@/lib/vendor-messages";
import { trySendVendorEmail } from "@/lib/email/vendor-order";
import { appendStockOrderLog } from "@/lib/stock-order-log";
import { prisma } from "@/lib/prisma";

export type PlaceEmailVendor = {
  id: string;
  name: string;
  email: string | null;
};

export type PlaceEmailOrder = {
  id: string;
  product: { name: string };
  vendor: PlaceEmailVendor | null;
  notifiedVendors: PlaceEmailVendor[];
};

export async function sendVendorPlaceEmails(input: {
  tenantName: string;
  orders: PlaceEmailOrder[];
  extraLog?: string;
  perVendorLogs?: boolean;
}): Promise<string[]> {
  const emailWarnings: string[] = [];
  const skuNamesByVendor = new Map<string, Set<string>>();
  const vendorById = new Map<string, PlaceEmailVendor>();

  for (const order of input.orders) {
    const targets =
      order.notifiedVendors.length > 0
        ? order.notifiedVendors
        : order.vendor
          ? [order.vendor]
          : [];
    for (const vendor of targets) {
      vendorById.set(vendor.id, vendor);
      const set = skuNamesByVendor.get(vendor.id) ?? new Set();
      set.add(order.product.name);
      skuNamesByVendor.set(vendor.id, set);
    }
  }

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
      subject: `New Order from ${input.tenantName}`,
      text: buildOrderEmail(input.tenantName, vendor.name, [...skuNames]),
    });
    sendResultByVendor.set(vendorId, sent ? "sent" : "failed");
    if (!sent) {
      emailWarnings.push(
        `Order placed but email could not be sent to ${vendor.name}. Check their email address in Settings.`,
      );
    }
  }

  for (const order of input.orders) {
    if (input.extraLog) {
      await appendStockOrderLog(prisma, order.id, input.extraLog);
    }
    const targets =
      order.notifiedVendors.length > 0
        ? order.notifiedVendors
        : order.vendor
          ? [order.vendor]
          : [];
    if (targets.length === 0) continue;
    if (input.perVendorLogs === false) continue;
    for (const vendor of targets) {
      const result = sendResultByVendor.get(vendor.id);
      const email = vendor.email?.trim() ?? "";
      if (result === "sent") {
        await appendStockOrderLog(
          prisma,
          order.id,
          `Order placed. Email sent to: ${vendor.name} (${email})`,
        );
      } else if (result === "failed") {
        await appendStockOrderLog(
          prisma,
          order.id,
          `Order placed. No email sent — email could not be sent to ${vendor.name} (${email}).`,
        );
      } else {
        await appendStockOrderLog(
          prisma,
          order.id,
          `Order placed. No email sent — no email address on file for ${vendor.name}.`,
        );
      }
    }
  }

  return emailWarnings;
}
