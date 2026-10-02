const LIST_MAX = 900;
const ITEM_LIMIT = 8;
const ITEM_SEP = " • ";

export function sanitizeTemplateVar(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/ {4,}/g, " ").trim();
  return cleaned || "-";
}

export function joinTruncated(items: string[], max = LIST_MAX): string {
  const cleaned = items.map((item) => sanitizeTemplateVar(item)).filter((item) => item !== "-");
  if (cleaned.length === 0) return "None";

  const visible = cleaned.slice(0, ITEM_LIMIT);
  let extra = cleaned.length - visible.length;
  let rows = visible;

  const render = (kept: string[], more: number) => {
    const base = kept.join(ITEM_SEP);
    return more > 0 ? `${base} +${more} more, open BarTally` : base;
  };

  while (rows.length > 1 && render(rows, extra).length > max) {
    extra += 1;
    rows = rows.slice(0, -1);
  }

  return sanitizeTemplateVar(render(rows, extra));
}

export function indianNumber(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}
