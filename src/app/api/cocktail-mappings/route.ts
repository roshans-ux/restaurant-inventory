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

const saveCocktailSchema = z.object({
  name: z.string().min(1).transform((v) => v.trim().replace(/\s+/g, " ")),
  posItemId: z.string().min(1).transform((v) => v.trim()),
  ingredients: cocktailIngredientsSchema,
});

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const mappings = await prisma.cocktailMapping.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { updatedAt: "desc" },
    });
    const dtos = await toCocktailMappingDtos(session.tenantId, mappings);
    recordApiMetric("GET /api/cocktail-mappings", 200, Date.now() - startedAt);
    return Response.json({ ok: true, mappings: dtos });
  } catch (error) {
    recordApiMetric("GET /api/cocktail-mappings", 500, Date.now() - startedAt);
    return apiError("COCKTAIL_MAPPINGS_FETCH_FAILED", "Failed to fetch cocktail mappings", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = saveCocktailSchema.parse(await request.json());
    await validateCocktailProducts(session.tenantId, parsed.ingredients);

    const conflict = await findPosItemConflict(session.tenantId, parsed.posItemId);
    if (conflict) {
      return apiError(
        "POS_ITEM_ALREADY_MAPPED",
        posItemConflictMessage(conflict, parsed.posItemId),
        409,
      );
    }

    const created = await prisma.cocktailMapping.create({
      data: {
        tenantId: session.tenantId,
        name: parsed.name,
        posItemId: parsed.posItemId,
        ingredients: parsed.ingredients,
      },
    });

    const [dto] = await toCocktailMappingDtos(session.tenantId, [created]);
    recordApiMetric("POST /api/cocktail-mappings", 201, Date.now() - startedAt);
    return Response.json({ ok: true, mapping: dto }, { status: 201 });
  } catch (error) {
    recordApiMetric("POST /api/cocktail-mappings", 400, Date.now() - startedAt);
    return apiError(
      "COCKTAIL_MAPPING_SAVE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
