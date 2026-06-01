import { z } from "zod";

export const COCKTAIL_POUR_OPTIONS_ML = [15, 22.5, 30, 45, 60, 75, 90, 120] as const;

export type CocktailPourMl = (typeof COCKTAIL_POUR_OPTIONS_ML)[number];

export type CocktailIngredient = {
  productId: string;
  quantityMl: number;
};

export const cocktailIngredientSchema = z.object({
  productId: z.string().uuid(),
  quantityMl: z
    .number()
    .refine(
      (n) => (COCKTAIL_POUR_OPTIONS_ML as readonly number[]).includes(n),
      "Invalid cocktail pour size",
    ),
});

export const cocktailIngredientsSchema = z
  .array(cocktailIngredientSchema)
  .min(1, "Add at least one alcohol line");

export function parseCocktailIngredients(value: unknown): CocktailIngredient[] {
  return cocktailIngredientsSchema.parse(value);
}

export function formatCocktailPourMl(ml: number): string {
  return Number.isInteger(ml) ? `${ml}ml` : `${ml}ml`;
}

export function formatCocktailRecipe(
  ingredients: CocktailIngredient[],
  productNameById: Map<string, string>,
): string {
  return ingredients
    .map((ing) => {
      const name = productNameById.get(ing.productId) ?? "Unknown bottle";
      return `${name} ${formatCocktailPourMl(ing.quantityMl)}`;
    })
    .join(", ");
}

export function emptyCocktailLine(): CocktailIngredient {
  return { productId: "", quantityMl: 30 };
}
