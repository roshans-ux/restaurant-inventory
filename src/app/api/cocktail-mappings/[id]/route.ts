import { NextRequest } from "next/server";
import { z } from "zod";
import { cocktailIngredientsSchema } from "@/lib/cocktail-mapping";
import {
  toCocktailMappingDtos,
  validateCocktailProducts,
} from "@/lib/cocktail-mapping-api";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import {
  findPosItemConflict,
  posItemConflictMessage,
} from "@/lib/pos-item-uniqueness";
import { prisma } from "@/lib/prisma";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

const updateCocktailSchema = z.object({
  name: z.string().min(1).transform((v) => v.trim().replace(/\s+/g, " ")),
  posItemId: z.string().min(1).transform((v) => v.trim()),
  ingredients: cocktailIngredientsSchema,
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  const { id } = await context.params;
  try {
    const parsed = updateCocktailSchema.parse(await request.json());
    const existing = await prisma.cocktailMapping.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) {
      return apiError("COCKTAIL_MAPPING_NOT_FOUND", "Cocktail mapping not found", 404);
    }

    await validateCocktailProducts(session.tenantId, parsed.ingredients);

    if (existing.posItemId !== parsed.posItemId) {
      const conflict = await findPosItemConflict(session.tenantId, parsed.posItemId, {
        cocktailMappingId: id,
      });
      if (conflict) {
        return apiError(
          "POS_ITEM_ALREADY_MAPPED",
          posItemConflictMessage(conflict, parsed.posItemId),
          409,
        );
      }
    }

    const updated = await prisma.cocktailMapping.update({
      where: { id },
      data: {
        name: parsed.name,
        posItemId: parsed.posItemId,
        ingredients: parsed.ingredients,
      },
    });

    const [dto] = await toCocktailMappingDtos(session.tenantId, [updated]);
    recordApiMetric("PATCH /api/cocktail-mappings/[id]", 200, Date.now() - startedAt);
    return Response.json({ ok: true, mapping: dto });
  } catch (error) {
    recordApiMetric("PATCH /api/cocktail-mappings/[id]", 400, Date.now() - startedAt);
    return apiError(
      "COCKTAIL_MAPPING_UPDATE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  const { id } = await context.params;
  try {
    const existing = await prisma.cocktailMapping.findFirst({
      where: { id, tenantId: session.tenantId },
    });
    if (!existing) {
      return apiError("COCKTAIL_MAPPING_NOT_FOUND", "Cocktail mapping not found", 404);
    }

    await prisma.cocktailMapping.delete({ where: { id } });
    recordApiMetric("DELETE /api/cocktail-mappings/[id]", 200, Date.now() - startedAt);
    return Response.json({ ok: true });
  } catch (error) {
    recordApiMetric("DELETE /api/cocktail-mappings/[id]", 500, Date.now() - startedAt);
    return apiError(
      "COCKTAIL_MAPPING_DELETE_FAILED",
      error instanceof Error ? error.message : "Failed to delete",
      500,
    );
  }
}
