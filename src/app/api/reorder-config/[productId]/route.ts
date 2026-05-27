import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncLowStockAlerts } from "@/lib/inventory";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findReorderConfigForTenant } from "@/lib/tenant";

const patchSchema = z.object({
  thresholdBottles: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().positive().optional(),
  notifyAdmin: z.boolean().optional(),
  notifyVendor: z.boolean().optional(),
});

type Params = { params: Promise<{ productId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  const { productId } = await params;
  const config = await findReorderConfigForTenant(session.tenantId, productId);

  if (!config) {
    return Response.json({ error: "Reorder config not found" }, { status: 404 });
  }

  return Response.json({ config });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const { productId } = await params;
    const parsed = patchSchema.parse(await request.json());

    const existing = await findReorderConfigForTenant(session.tenantId, productId);
    if (!existing) {
      return Response.json({ error: "Reorder config not found" }, { status: 404 });
    }

    const updated = await prisma.reorderConfig.update({
      where: { productId },
      data: parsed,
    });

    await syncLowStockAlerts(productId);

    return Response.json({ config: updated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
