import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_POURS_ML } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";
import {
  isPosItemConfigured,
  syncDraftMappingsForTenant,
} from "@/lib/pos-draft-mappings";
import { excludeDraftSuppressionMappings } from "@/lib/pos-mapping-utils";
import {
  findPosItemConflict,
  posItemConflictMessage,
} from "@/lib/pos-item-uniqueness";

const createMappingSchema = z.object({
  productId: z.string().uuid(),
  posItemId: z.string().min(1).transform((v) => v.trim()),
  pourMl: z.number().positive().default(DEFAULT_POURS_ML[0]),
});

const updatePosItemSchema = z.object({
  id: z.string().uuid(),
  posItemId: z.union([z.string(), z.null()]).transform((v) => {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  productId: z.string().uuid().optional(),
  pourMl: z.number().positive().optional(),
});

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    let draftSyncWarning: string | undefined;

    const mappingsBeforeSync = await prisma.posMenuMapping.findMany({
      where: { tenantId: session.tenantId, ...excludeDraftSuppressionMappings() },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { pourMl: "asc" }],
    });

    try {
      await syncDraftMappingsForTenant(session.tenantId);
    } catch (syncError) {
      console.error("POS mapping draft sync failed:", syncError);
      draftSyncWarning =
        syncError instanceof Error ? syncError.message : "Draft mapping sync failed";
    }

    const mappings = draftSyncWarning
      ? mappingsBeforeSync
      : await prisma.posMenuMapping.findMany({
          where: { tenantId: session.tenantId, ...excludeDraftSuppressionMappings() },
          include: { product: true },
          orderBy: [{ product: { name: "asc" } }, { pourMl: "asc" }],
        });

    recordApiMetric("GET /api/pos-mappings", 200, Date.now() - startedAt);
    return Response.json({
      ok: true,
      mappings,
      defaultPoursMl: DEFAULT_POURS_ML,
      ...(draftSyncWarning ? { draftSyncWarning } : {}),
    });
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
    const parsed = createMappingSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);
    if (!product) {
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const posItemConflict = await findPosItemConflict(session.tenantId, parsed.posItemId);
    if (posItemConflict) {
      return apiError(
        "POS_ITEM_ALREADY_MAPPED",
        posItemConflictMessage(posItemConflict, parsed.posItemId),
        409,
      );
    }

    const existingByPour = await prisma.posMenuMapping.findFirst({
      where: {
        tenantId: session.tenantId,
        productId: parsed.productId,
        pourMl: parsed.pourMl,
      },
    });

    const mapping = existingByPour
      ? await prisma.posMenuMapping.update({
          where: { id: existingByPour.id },
          data: { posItemId: parsed.posItemId },
          include: { product: true },
        })
      : await prisma.posMenuMapping.create({
          data: {
            tenantId: session.tenantId,
            productId: parsed.productId,
            posItemId: parsed.posItemId,
            pourMl: parsed.pourMl,
          } satisfies Prisma.PosMenuMappingUncheckedCreateInput,
          include: { product: true },
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

export async function PATCH(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = updatePosItemSchema.parse(await request.json());

    const existing = await prisma.posMenuMapping.findFirst({
      where: { id: parsed.id, tenantId: session.tenantId },
    });
    if (!existing) {
      return apiError("POS_MAPPING_NOT_FOUND", "Mapping not found", 404);
    }

    const nextPosItemId = parsed.posItemId !== undefined ? parsed.posItemId : existing.posItemId;

    const configuredPosItemId = nextPosItemId?.trim() ?? "";
    if (isPosItemConfigured(configuredPosItemId) && existing.posItemId !== nextPosItemId) {
      const posItemConflict = await findPosItemConflict(session.tenantId, configuredPosItemId, {
        pourMappingId: parsed.id,
      });
      if (posItemConflict) {
        return apiError(
          "POS_ITEM_ALREADY_MAPPED",
          posItemConflictMessage(posItemConflict, configuredPosItemId),
          409,
        );
      }
    }

    if (parsed.productId) {
      const product = await findProductForTenant(session.tenantId, parsed.productId);
      if (!product) {
        return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
      }
    }

    const mapping = await prisma.posMenuMapping.update({
      where: { id: parsed.id },
      data: {
        ...(parsed.posItemId !== undefined ? { posItemId: parsed.posItemId } : {}),
        ...(parsed.productId ? { productId: parsed.productId } : {}),
        ...(parsed.pourMl ? { pourMl: parsed.pourMl } : {}),
      },
      include: { product: true },
    });

    recordApiMetric("PATCH /api/pos-mappings", 200, Date.now() - startedAt);
    return Response.json({ ok: true, mapping });
  } catch (error) {
    recordApiMetric("PATCH /api/pos-mappings", 400, Date.now() - startedAt);
    return apiError(
      "POS_MAPPING_UPDATE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
