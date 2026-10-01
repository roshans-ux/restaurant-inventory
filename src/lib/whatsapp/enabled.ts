function envFlagTrue(value: string | undefined): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Master switch. `WHATSAPP_ENABLED` is canonical; `WHATSAPP_APPROVAL_REQUIRED` is still accepted. */
export function isWhatsAppEnabled(): boolean {
  if (process.env.WHATSAPP_ENABLED !== undefined && process.env.WHATSAPP_ENABLED.trim() !== "") {
    return envFlagTrue(process.env.WHATSAPP_ENABLED);
  }
  return envFlagTrue(process.env.WHATSAPP_APPROVAL_REQUIRED);
}
