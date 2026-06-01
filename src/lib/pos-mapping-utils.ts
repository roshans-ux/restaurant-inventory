import { Prisma } from "@prisma/client";
import { FIXED_POUR_OPTIONS_ML } from "@/lib/mapping-sale-size";
import { isBeerBottleSize } from "@/lib/product-naming";

export const DRAFT_SUPPRESSED_PREFIX = "__draft_suppressed__:";

export function draftPourSizesForBottle(bottleSizeMl: number): number[] {
  if (isBeerBottleSize(bottleSizeMl)) {
    return [bottleSizeMl];
  }
  return [...FIXED_POUR_OPTIONS_ML, bottleSizeMl];
}

export function isPosItemConfigured(posItemId: string | null | undefined): boolean {
  return Boolean(posItemId?.trim()) && !isDraftSuppressedPosItemId(posItemId);
}

export function draftSuppressedPosItemId(productId: string, pourMl: number): string {
  return `${DRAFT_SUPPRESSED_PREFIX}${productId}:${pourMl}`;
}

export function isDraftSuppressedPosItemId(posItemId: string | null | undefined): boolean {
  return Boolean(posItemId?.startsWith(DRAFT_SUPPRESSED_PREFIX));
}

export function excludeDraftSuppressionMappings(): Prisma.PosMenuMappingWhereInput {
  return {
    NOT: {
      posItemId: { startsWith: DRAFT_SUPPRESSED_PREFIX },
    },
  };
}
