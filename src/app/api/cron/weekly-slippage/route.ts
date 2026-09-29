import { NextRequest } from "next/server";
import { sendWeeklySlippageReports } from "@/lib/whatsapp/slippage-weekly";

function isAuthorized(request: NextRequest): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendWeeklySlippageReports();
  return Response.json({ ok: true, ...result });
}
