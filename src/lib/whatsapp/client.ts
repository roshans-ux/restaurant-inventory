export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

export type AdminReorderPrompt = {
  tenantId: string;
  stockOrderId: string;
  adminWhatsappNumber: string | null;
  venueName: string;
  productName: string;
  quantityBottles: number;
  vendorName: string | null;
};

export type VendorOrderMessage = {
  vendorWhatsappNumber: string | null;
  body: string;
};

export async function sendAdminReorderPrompt(payload: AdminReorderPrompt): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.info("[whatsapp] skip admin prompt (API not connected)", {
      stockOrderId: payload.stockOrderId,
      hasAdminNumber: Boolean(payload.adminWhatsappNumber),
    });
    return;
  }
  if (!payload.adminWhatsappNumber) {
    console.info("[whatsapp] skip admin prompt (no admin WhatsApp on Settings)", {
      stockOrderId: payload.stockOrderId,
    });
    return;
  }
  // Meta Cloud send lands here when WHATSAPP_TOKEN is set.
  console.info("[whatsapp] admin prompt queued", { stockOrderId: payload.stockOrderId });
}

export async function sendVendorOrder(payload: VendorOrderMessage): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.info("[whatsapp] skip vendor order (API not connected)");
    return;
  }
  if (!payload.vendorWhatsappNumber || payload.vendorWhatsappNumber === "—") {
    console.info("[whatsapp] skip vendor order (no vendor WhatsApp)");
    return;
  }
  console.info("[whatsapp] vendor order queued");
}
