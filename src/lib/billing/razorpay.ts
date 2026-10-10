import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingPlan } from "@prisma/client";
import {
  SETUP_FEE_PAISE,
  SUBSCRIPTION_START_AT_UNIX,
  SUBSCRIPTION_TOTAL_COUNT,
} from "@/lib/billing/constants";

export class RazorpayConfigError extends Error {
  constructor(message = "Razorpay is not configured") {
    super(message);
    this.name = "RazorpayConfigError";
  }
}

export class RazorpayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) {
    throw new RazorpayConfigError();
  }
  return { keyId, keySecret };
}

export function getRazorpayKeyId(): string {
  return razorpayKeys().keyId;
}

function planIdFromEnv(plan: BillingPlan): string {
  const envName =
    plan === "ESSENTIALS"
      ? "RAZORPAY_PLAN_ESSENTIALS_PILOT"
      : plan === "PRO"
        ? "RAZORPAY_PLAN_PRO_PILOT"
        : "RAZORPAY_PLAN_CHAINS_PILOT";
  const id = process.env[envName]?.trim() ?? "";
  if (!id) {
    throw new RazorpayConfigError(`${envName} is not set`);
  }
  return id;
}

async function razorpayPost<T>(path: string, body: unknown): Promise<T> {
  const { keyId, keySecret } = razorpayKeys();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const description =
      json &&
      typeof json === "object" &&
      "error" in json &&
      json.error &&
      typeof json.error === "object" &&
      "description" in json.error &&
      typeof json.error.description === "string"
        ? json.error.description
        : "Razorpay request failed";
    throw new RazorpayApiError(description);
  }
  return json as T;
}

export async function createPilotSubscription(opts: {
  plan: BillingPlan;
  outlets: number;
  tenantId: string;
  email: string;
}): Promise<{ id: string }> {
  const planId = planIdFromEnv(opts.plan);
  const quantity = opts.plan === "CHAINS" ? Math.max(1, opts.outlets) : 1;
  const created = await razorpayPost<{ id: string }>("/subscriptions", {
    plan_id: planId,
    total_count: SUBSCRIPTION_TOTAL_COUNT,
    quantity,
    customer_notify: false,
    start_at: SUBSCRIPTION_START_AT_UNIX,
    addons: [
      {
        item: {
          name: "Pilot setup",
          amount: SETUP_FEE_PAISE,
          currency: "INR",
        },
      },
    ],
    notes: {
      tenantId: opts.tenantId,
      email: opts.email,
      plan: opts.plan,
    },
  });
  if (!created?.id) {
    throw new RazorpayApiError("Razorpay did not return a subscription id");
  }
  return { id: created.id };
}

export function verifySubscriptionPaymentSignature(opts: {
  paymentId: string;
  subscriptionId: string;
  signature: string;
}): boolean {
  const { keySecret } = razorpayKeys();
  const payload = `${opts.paymentId}|${opts.subscriptionId}`;
  const expected = createHmac("sha256", keySecret).update(payload).digest();
  try {
    const given = Buffer.from(opts.signature, "hex");
    if (given.length !== expected.length) return false;
    return timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}
