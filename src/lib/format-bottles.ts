export const QUARTER_ML = 180;

/** e.g. 360ml → "2 quarters"; 210ml → "1 quarter, 30ml"; 30ml → "30ml" */
export function formatQuartersAndMl(ml: number): string {
  if (ml <= 0) return "0ml";
  const quarters = Math.floor(ml / QUARTER_ML);
  const remainderMl = ml % QUARTER_ML;
  const parts: string[] = [];
  if (quarters > 0) {
    parts.push(quarters === 1 ? "1 quarter" : `${quarters} quarters`);
  }
  if (remainderMl > 0) {
    parts.push(`${remainderMl}ml`);
  }
  return parts.join(", ");
}

/** Human-readable stock: e.g. "23 full, 1 with 2 quarters left" (one partial line for all open volume). */
export function formatBottleStock(currentMl: number, bottleSizeMl: number): string {
  if (bottleSizeMl <= 0) return "—";
  const full = Math.floor(currentMl / bottleSizeMl);
  const remainderMl = currentMl - full * bottleSizeMl;
  if (remainderMl <= 0) {
    return `${full} full`;
  }
  return `${full} full, 1 with ${formatQuartersAndMl(remainderMl)} left`;
}
