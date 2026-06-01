import { prisma } from "@/lib/prisma";

export type PosItemConflict =
  | { kind: "pour"; label: string }
  | { kind: "cocktail"; label: string };

export async function findPosItemConflict(
  tenantId: string,
  posItemId: string,
  exclude?: { pourMappingId?: string; cocktailMappingId?: string },
): Promise<PosItemConflict | null> {
  const trimmed = posItemId.trim();
  if (!trimmed) return null;

  const pour = await prisma.posMenuMapping.findFirst({
    where: {
      tenantId,
      posItemId: trimmed,
      ...(exclude?.pourMappingId ? { NOT: { id: exclude.pourMappingId } } : {}),
    },
    include: { product: true },
  });
  if (pour) {
    return { kind: "pour", label: pour.product.name };
  }

  const cocktail = await prisma.cocktailMapping.findFirst({
    where: {
      tenantId,
      posItemId: trimmed,
      ...(exclude?.cocktailMappingId ? { NOT: { id: exclude.cocktailMappingId } } : {}),
    },
  });
  if (cocktail) {
    return { kind: "cocktail", label: cocktail.name };
  }

  return null;
}

export function posItemConflictMessage(conflict: PosItemConflict, posItemId: string): string {
  if (conflict.kind === "cocktail") {
    return `POS item "${posItemId}" is already mapped to cocktail "${conflict.label}". Use a different POS item ID.`;
  }
  return `POS item "${posItemId}" is already mapped to ${conflict.label}. Use a different POS item ID.`;
}
