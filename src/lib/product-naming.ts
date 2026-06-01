export const BEER_BOTTLE_SIZES_ML = [330, 650] as const;

export const BOTTLE_SIZE_OPTIONS = [
  { label: "330ml", ml: 330 },
  { label: "650ml", ml: 650 },
  { label: "750ml", ml: 750 },
  { label: "1L", ml: 1000 },
  { label: "1.75L", ml: 1750 },
  { label: "2L", ml: 2000 },
] as const;

export const ALLOWED_BOTTLE_SIZE_ML = BOTTLE_SIZE_OPTIONS.map((o) => o.ml);

export function isBeerBottleSize(bottleSizeMl: number): boolean {
  return (BEER_BOTTLE_SIZES_ML as readonly number[]).includes(bottleSizeMl);
}

export function normalizeBottleSizeMl(ml: number): number {
  if (BOTTLE_SIZE_OPTIONS.some((o) => o.ml === ml)) return ml;
  return ALLOWED_BOTTLE_SIZE_ML.reduce((best, cur) =>
    Math.abs(cur - ml) < Math.abs(best - ml) ? cur : best,
  );
}

export function formatBottleSizeLabel(ml: number): string {
  const match = BOTTLE_SIZE_OPTIONS.find((o) => o.ml === ml);
  return match?.label ?? `${ml}ml`;
}

export function normalizeBottleName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export const DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE =
  "This item and size already exists in the inventory.";

export function isSameBottleNameAndSize(
  nameA: string,
  sizeA: number,
  nameB: string,
  sizeB: number,
): boolean {
  return normalizeBottleName(nameA) === normalizeBottleName(nameB) && sizeA === sizeB;
}

/** e.g. Grey Goose + 750 → GG-750, Black Label + 750 → BL-750 */
export function skuFromNameAndSize(name: string, bottleSizeMl: number): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const letter = word.replace(/[^a-zA-Z0-9]/g, "").charAt(0);
      return letter ? letter.toUpperCase() : "";
    })
    .join("");
  const size = Math.round(bottleSizeMl);
  return `${initials || "ITEM"}-${size}`;
}

/** @deprecated Use skuFromNameAndSize */
export function skuBaseFromName(name: string) {
  return skuFromNameAndSize(name, 750).replace(/-\d+$/, "");
}

export function nextCandidateSku(base: string, attempt: number) {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}

