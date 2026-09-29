const LIST_MAX = 900;

export function sanitizeTemplateVar(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/ {4,}/g, " ").trim();
  return cleaned || "-";
}

export function joinTruncated(items: string[], max = LIST_MAX): string {
  const cleaned = items.map((item) => sanitizeTemplateVar(item)).filter((item) => item !== "-");
  if (cleaned.length === 0) return "None";
  const joined = cleaned.join(", ");
  if (joined.length <= max) return sanitizeTemplateVar(joined);
  const kept: string[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const rest = cleaned.length - i;
    const suffix = ` +${rest} more`;
    const candidate = kept.length ? `${kept.join(", ")}, ${cleaned[i]}` : cleaned[i]!;
    if (kept.length > 0 && candidate.length + suffix.length > max) {
      return sanitizeTemplateVar(`${kept.join(", ")} +${rest} more`);
    }
    kept.push(cleaned[i]!);
  }
  return sanitizeTemplateVar(kept.join(", "));
}

export function indianNumber(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}
