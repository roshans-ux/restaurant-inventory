export type IncomingWhatsAppMessage = {
  from: string;
  id: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

export type ApprovalPayloadAction = "APPROVE_ALL" | "CANCEL";

export function extractReplyPayload(message: IncomingWhatsAppMessage): string {
  const buttonPayload = message.button?.payload?.trim() ?? "";
  const interactiveId =
    message.interactive?.button_reply?.id?.trim() ||
    message.interactive?.list_reply?.id?.trim() ||
    "";
  return buttonPayload || interactiveId;
}

export function parseApprovalPayload(
  raw: string,
): { action: ApprovalPayloadAction; batchId: string } | null {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0) return null;
  const action = trimmed.slice(0, idx).trim().toUpperCase().replace(/-/g, "_");
  const batchId = trimmed.slice(idx + 1).trim();
  if (!batchId) return null;
  if (action === "APPROVE_ALL" || action === "CANCEL") {
    return { action, batchId };
  }
  return null;
}
