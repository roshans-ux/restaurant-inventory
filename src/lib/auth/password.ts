import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const derived = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
