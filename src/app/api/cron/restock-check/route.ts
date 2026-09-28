import { NextRequest } from "next/server";
import { checkRestockForTenant } from "@/lib/restock-check";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  let notified = 0;
  for (const tenant of tenants) {
    const result = await checkRestockForTenant(tenant.id);
    created += result.created;
    notified += result.notified;
  }
  return Response.json({ ok: true, tenants: tenants.length, created, notified });
}
