import type { CocktailMapping, Product } from "@prisma/client";
import {
  type CocktailIngredient,
  formatCocktailRecipe,
  parseCocktailIngredients,
} from "@/lib/cocktail-mapping";
import { prisma } from "@/lib/prisma";

export type CocktailMappingDto = {
  id: string;
  name: string;
  posItemId: string;
  ingredients: CocktailIngredient[];
  recipe: string;
  createdAt: string;
  updatedAt: string;
};

export async function validateCocktailProducts(
  tenantId: string,
  ingredients: CocktailIngredient[],
): Promise<void> {
  const ids = [...new Set(ingredients.map((i) => i.productId))];
  const found = await prisma.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new Error("One or more bottles were not found in your catalog");
  }
}

export async function toCocktailMappingDtos(
  tenantId: string,
  mappings: CocktailMapping[],
): Promise<CocktailMappingDto[]> {
  const productIds = new Set<string>();
  for (const mapping of mappings) {
    for (const ing of parseCocktailIngredients(mapping.ingredients)) {
      productIds.add(ing.productId);
    }
  }

  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: [...productIds] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  return mappings.map((mapping) => {
    const ingredients = parseCocktailIngredients(mapping.ingredients);
    return {
      id: mapping.id,
      name: mapping.name,
      posItemId: mapping.posItemId,
      ingredients,
      recipe: formatCocktailRecipe(ingredients, nameById),
      createdAt: mapping.createdAt.toISOString(),
      updatedAt: mapping.updatedAt.toISOString(),
    };
  });
}
