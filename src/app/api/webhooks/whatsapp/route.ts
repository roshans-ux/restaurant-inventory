import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import {
  cancelStockOrderFromWhatsApp,
  placeStockOrderFromWhatsApp,
} from "@/lib/whatsapp/order-actions";

/** Meta Cloud verification handshake. Live after WHATSAPP_VERIFY_TOKEN is set. */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return apiError("WHATSAPP_VERIFY_FAILED", "WhatsApp webhook not configured", 403);
}

type ButtonReply = {
  action?: "place" | "cancel";
  stockOrderId?: string;
};

function parseButtonReply(body: unknown): ButtonReply {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const action = record.action === "place" || record.action === "cancel" ? record.action : undefined;
  const stockOrderId =
    typeof record.stockOrderId === "string" ? record.stockOrderId : undefined;
  return { action, stockOrderId };
}

export async function POST(request: NextRequest) {
  if (!process.env.WHATSAPP_TOKEN?.trim()) {
    return apiOk({ ignored: true, reason: "whatsapp_not_connected" });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Invalid JSON", 400);
  }

  const { action, stockOrderId } = parseButtonReply(json);
  if (!action || !stockOrderId) {
    return apiOk({ ignored: true });
  }

  const result =
    action === "place"
      ? await placeStockOrderFromWhatsApp(stockOrderId)
      : await cancelStockOrderFromWhatsApp(stockOrderId);

  if (!result.ok) {
    return apiError(result.reason, "Could not update stock order", 400);
  }
  return apiOk({ handled: true, alreadyHandled: result.alreadyHandled ?? false });
}
