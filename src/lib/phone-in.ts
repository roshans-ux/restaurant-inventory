/** India mobile: 10 digits starting with 6–9. Accepts +91 / leading 0 / spaces. */

export const INDIAN_PHONE_ERROR = "Enter a valid 10-digit Indian mobile number";

/**
 * Normalize an Indian mobile number to `+91XXXXXXXXXX`, or null if invalid.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  if (national.length === 12 && national.startsWith("91")) {
    national = national.slice(2);
  } else if (national.length === 11 && national.startsWith("0")) {
    national = national.slice(1);
  }

  if (national.length !== 10) return null;
  if (!/^[6-9]\d{9}$/.test(national)) return null;

  return `+91${national}`;
}

export function isValidIndianPhone(input: string): boolean {
  return normalizeIndianPhone(input) !== null;
}
