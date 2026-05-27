export const BOTTLE_SIZE_OPTIONS = [
  { label: "750ml", ml: 750 },
  { label: "1L", ml: 1000 },
  { label: "1.75L", ml: 1750 },
  { label: "2L", ml: 2000 },
] as const;

export const ALLOWED_BOTTLE_SIZE_ML = BOTTLE_SIZE_OPTIONS.map((o) => o.ml);

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

