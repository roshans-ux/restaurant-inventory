import type { BillingPlan } from "@prisma/client";

/** 31 Dec 2026 23:59:59 IST */
export const TRIAL_ENDS_AT = new Date("2026-12-31T18:29:59.000Z");

/** 31 Dec 2027 23:59:59 IST */
export const PRICE_LOCKED_UNTIL = new Date("2027-12-31T18:29:59.000Z");

/** 1 Jan 2027 00:00:00 IST */
export const SUBSCRIPTION_START_AT_UNIX = Math.floor(
  Date.parse("2026-12-31T18:30:00.000Z") / 1000,
);

export const SUBSCRIPTION_TOTAL_COUNT = 12;
export const SETUP_FEE_INR = 4999;
export const SETUP_FEE_PAISE = SETUP_FEE_INR * 100;
export const FOUNDING_MONTHLY_INR = 999;

export const PILOT_MONTHLY_INR: Record<BillingPlan, number> = {
  ESSENTIALS: 999,
  PRO: 1299,
  CHAINS: 1599,
};

export const STANDARD_MONTHLY_INR: Record<BillingPlan, number> = {
  ESSENTIALS: 1999,
  PRO: 3999,
  CHAINS: 3499,
};

export function monthlyPriceFromJanuaryInr(opts: {
  plan: BillingPlan;
  outlets: number;
  setupFeeWaived: boolean;
}): number {
  if (opts.setupFeeWaived) return FOUNDING_MONTHLY_INR;
  const per = PILOT_MONTHLY_INR[opts.plan];
  if (opts.plan === "CHAINS") return per * Math.max(1, opts.outlets);
  return per;
}

export function parseBillingPlan(raw: unknown): BillingPlan {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (value === "ESSENTIALS" || value === "PRO" || value === "CHAINS") return value;
  return "PRO";
}

export function parseOutlets(raw: unknown, plan: BillingPlan): number {
  if (plan !== "CHAINS") return 1;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(99, Math.floor(n));
}
