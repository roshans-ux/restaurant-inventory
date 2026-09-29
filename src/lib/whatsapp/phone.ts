/** Digits-only E.164 without plus. Bare 10-digit Indian mobiles get 91. */
export function toWhatsAppDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]\d{9}$/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length < 8) return null;
  return digits;
}

export function whatsappPhonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = toWhatsAppDigits(a);
  const right = toWhatsAppDigits(b);
  return Boolean(left && right && left === right);
}
