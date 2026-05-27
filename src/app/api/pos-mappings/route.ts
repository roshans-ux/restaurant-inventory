import { NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_POURS_ML } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";

const mappingSchema = z.object({
  productId: z.string().uuid(),
  posItemId: z.string().min(1),
  pourMl: z.number().positive().default(DEFAULT_POURS_ML[0]),
});

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const mappings = await prisma.posMenuMapping.findMany({
      where: { tenantId: session.tenantId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    recordApiMetric("GET /api/pos-mappings", 200, Date.now() - startedAt);
    return Response.json({ ok: true, mappings, defaultPoursMl: DEFAULT_POURS_ML });
  } catch (error) {
    recordApiMetric("GET /api/pos-mappings", 500, Date.now() - startedAt);
    return apiError("POS_MAPPINGS_FETCH_FAILED", "Failed to fetch mappings", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = mappingSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);
    if (!product) {
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const mapping = await prisma.posMenuMapping.upsert({
      where: {
        tenantId_posItemId: {
          tenantId: session.tenantId,
          posItemId: parsed.posItemId,
        },
      },
      create: {
        tenantId: session.tenantId,
        productId: parsed.productId,
        posItemId: parsed.posItemId,
        pourMl: parsed.pourMl,
      },
      update: {
        productId: parsed.productId,
        pourMl: parsed.pourMl,
      },
    });

    recordApiMetric("POST /api/pos-mappings", 201, Date.now() - startedAt);
    return Response.json({ ok: true, mapping }, { status: 201 });
  } catch (error) {
    recordApiMetric("POST /api/pos-mappings", 400, Date.now() - startedAt);
    return apiError(
      "POS_MAPPING_SAVE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
