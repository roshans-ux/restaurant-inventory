import { isPosItemConfigured } from "@/lib/pos-mapping-utils";
import {
  parseCocktailIngredients,
  type CocktailIngredient,
} from "@/lib/cocktail-mapping";
import type { CatalogMappingOption } from "@/lib/sales-import/types";

export type PourCatalogEntry = {
  kind: "pour";
  posItemId: string;
  productId: string;
  productName: string;
  pourMl: number;
  defaultPourMl: number;
};

export type CocktailCatalogEntry = {
  kind: "cocktail";
  posItemId: string;
  name: string;
  ingredients: CocktailIngredient[];
};

export type CatalogEntry = PourCatalogEntry | CocktailCatalogEntry;

export type ImportCatalog = {
  options: CatalogMappingOption[];
  byPosItemId: Map<string, CatalogEntry>;
  byPosItemIdCi: Map<string, CatalogEntry>;
  poursByProductNameCi: Map<string, PourCatalogEntry[]>;
  cocktailsByNameCi: Map<string, CocktailCatalogEntry[]>;
};

export type ResolveStatus =
  | { status: "matched"; entry: CatalogEntry }
  | { status: "ambiguous"; productName: string; options: PourCatalogEntry[] }
  | { status: "unmatched" };

export function buildImportCatalog(args: {
  pours: Array<{
    posItemId: string | null;
    productId: string;
    pourMl: unknown;
    product: { name: string; defaultPourMl: unknown };
  }>;
  cocktails: Array<{
    posItemId: string;
    name: string;
    ingredients: unknown;
  }>;
}): ImportCatalog {
  const byPosItemId = new Map<string, CatalogEntry>();
  const byPosItemIdCi = new Map<string, CatalogEntry>();
  const poursByProductNameCi = new Map<string, PourCatalogEntry[]>();
  const cocktailsByNameCi = new Map<string, CocktailCatalogEntry[]>();
  const options: CatalogMappingOption[] = [];

  for (const row of args.pours) {
    if (!isPosItemConfigured(row.posItemId) || !row.posItemId) continue;
    const entry: PourCatalogEntry = {
      kind: "pour",
      posItemId: row.posItemId,
      productId: row.productId,
      productName: row.product.name,
      pourMl: Number(row.pourMl),
      defaultPourMl: Number(row.product.defaultPourMl),
    };
    byPosItemId.set(entry.posItemId, entry);
    byPosItemIdCi.set(entry.posItemId.toLowerCase(), entry);
    const nameKey = entry.productName.trim().toLowerCase();
    const list = poursByProductNameCi.get(nameKey) ?? [];
    list.push(entry);
    poursByProductNameCi.set(nameKey, list);
    options.push({
      posItemId: entry.posItemId,
      label: `${entry.productName} · ${entry.posItemId} · ${entry.pourMl}ml`,
      kind: "pour",
      productName: entry.productName,
      pourMl: entry.pourMl,
    });
  }

  for (const row of args.cocktails) {
    if (!row.posItemId.trim()) continue;
    let ingredients: CocktailIngredient[];
    try {
      ingredients = parseCocktailIngredients(row.ingredients);
    } catch {
      continue;
    }
    const entry: CocktailCatalogEntry = {
      kind: "cocktail",
      posItemId: row.posItemId,
      name: row.name,
      ingredients,
    };
    byPosItemId.set(entry.posItemId, entry);
    byPosItemIdCi.set(entry.posItemId.toLowerCase(), entry);
    const nameKey = entry.name.trim().toLowerCase();
    const list = cocktailsByNameCi.get(nameKey) ?? [];
    list.push(entry);
    cocktailsByNameCi.set(nameKey, list);
    options.push({
      posItemId: entry.posItemId,
      label: `${entry.name} · ${entry.posItemId} (cocktail)`,
      kind: "cocktail",
    });
  }

  options.sort((a, b) => a.label.localeCompare(b.label));
  return { options, byPosItemId, byPosItemIdCi, poursByProductNameCi, cocktailsByNameCi };
}

function uniquePours(list: PourCatalogEntry[]): PourCatalogEntry[] {
  const seen = new Set<string>();
  const out: PourCatalogEntry[] = [];
  for (const entry of list) {
    if (seen.has(entry.posItemId)) continue;
    seen.add(entry.posItemId);
    out.push(entry);
  }
  return out;
}

export function resolveCatalogEntry(
  catalog: ImportCatalog,
  posItemId: string,
  itemName: string,
  resolutions: Record<string, string>,
): ResolveStatus {
  const id = posItemId.trim();
  const name = itemName.trim();
  const resolution = resolutions[name.toLowerCase()] ?? resolutions[id.toLowerCase()];
  if (
    resolution &&
    resolution !== "skip" &&
    resolution !== "ignore" &&
    resolution !== "change"
  ) {
    const aliased =
      catalog.byPosItemId.get(resolution) ?? catalog.byPosItemIdCi.get(resolution.toLowerCase());
    if (aliased) return { status: "matched", entry: aliased };
  }

  if (id) {
    const byId = catalog.byPosItemId.get(id) ?? catalog.byPosItemIdCi.get(id.toLowerCase());
    if (byId) return { status: "matched", entry: byId };
  }

  if (!name) return { status: "unmatched" };

  const key = name.toLowerCase();
  const byPosName = catalog.byPosItemId.get(name) ?? catalog.byPosItemIdCi.get(key);
  if (byPosName) return { status: "matched", entry: byPosName };

  const cocktails = catalog.cocktailsByNameCi.get(key) ?? [];
  if (cocktails.length === 1) return { status: "matched", entry: cocktails[0]! };
  if (cocktails.length > 1) {
    return {
      status: "ambiguous",
      productName: cocktails[0]!.name,
      options: [],
    };
  }

  const pours = uniquePours(catalog.poursByProductNameCi.get(key) ?? []);
  if (pours.length === 1) return { status: "matched", entry: pours[0]! };
  if (pours.length > 1) {
    return { status: "ambiguous", productName: pours[0]!.productName, options: pours };
  }

  return { status: "unmatched" };
}

export function mappingOptionsForPours(pours: PourCatalogEntry[]): CatalogMappingOption[] {
  return pours.map((entry) => ({
    posItemId: entry.posItemId,
    label: `${entry.productName} · ${entry.pourMl}ml · ${entry.posItemId}`,
    kind: "pour" as const,
    productName: entry.productName,
    pourMl: entry.pourMl,
  }));
}
