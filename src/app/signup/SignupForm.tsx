"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type PlanId = "ESSENTIALS" | "PRO" | "CHAINS";

function planFromQuery(raw: string | null): PlanId {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "essentials") return "ESSENTIALS";
  if (v === "chains") return "CHAINS";
  return "PRO";
}

type CheckoutPayload = {
  razorpayKeyId: string;
  subscriptionId: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-razorpay-checkout]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("checkout")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("checkout"));
    document.body.appendChild(script);
  });
}

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<PlanId>(() => planFromQuery(searchParams.get("plan")));
  const [outlets, setOutlets] = useState("1");
  const [foundingCode, setFoundingCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [foundingError, setFoundingError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentPending, setPaymentPending] = useState(searchParams.get("pay") === "1");
  const [paying, setPaying] = useState(false);

  function clearErrors() {
    setEmailError("");
    setPhoneError("");
    setPasswordError("");
    setConfirmError("");
    setFoundingError("");
    setFormError("");
  }

  async function verifyPayment(response: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) {
    const res = await fetch("/api/billing/verify-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message ?? "Payment could not be verified");
    }
    router.replace("/onboarding?signedup=1");
    router.refresh();
  }

  async function openCheckout(checkout: CheckoutPayload) {
    await loadRazorpayScript();
    if (!window.Razorpay) {
      throw new Error("Payment window could not load");
    }
    const rzp = new window.Razorpay({
      key: checkout.razorpayKeyId,
      subscription_id: checkout.subscriptionId,
      name: "BarTally",
      description: "Pilot setup and monthly auto-pay from 1 January 2027",
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_subscription_id: string;
        razorpay_signature: string;
      }) => {
        void verifyPayment(response).catch((err: unknown) => {
          setPaymentPending(true);
          setFormError(err instanceof Error ? err.message : "Payment could not be verified");
        });
      },
      modal: {
        ondismiss: () => {
          setPaymentPending(true);
          setFormError("");
        },
      },
    });
    rzp.open();
  }

  async function retryPayment() {
    setPaying(true);
    setFormError("");
    try {
      const res = await fetch("/api/billing/checkout-session");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Could not start payment");
      }
      if (!data.data?.paymentPending) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      await openCheckout({
        razorpayKeyId: data.data.razorpayKeyId,
        subscriptionId: data.data.subscriptionId,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setPaying(false);
    }
  }

  useEffect(() => {
    if (searchParams.get("pay") !== "1") return;
    setPaymentPending(true);
  }, [searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearErrors();

    let hasError = false;
    if (!isValidEmail(email)) {
      setEmailError("Invalid Email");
      hasError = true;
    }
    const normalizedPhone = normalizeIndianPhone(phone);
    if (!normalizedPhone) {
      setPhoneError(INDIAN_PHONE_ERROR);
      hasError = true;
    }
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      hasError = true;
    }
    if (password !== passwordConfirm) {
      setConfirmError("Passwords do not match");
      hasError = true;
    }
    if (hasError || !normalizedPhone) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone: normalizedPhone,
          password,
          passwordConfirm,
          plan,
          outlets: plan === "CHAINS" ? Number(outlets) || 1 : 1,
          foundingCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const field = data.error?.details?.field;
        const message = data.error?.message ?? "Sign up failed";
        if (field === "email" || data.error?.code === "EMAIL_IN_USE") {
          setEmailError(message);
        } else if (field === "phone") {
          setPhoneError(message);
        } else if (field === "password") {
          setPasswordError(message);
        } else if (field === "passwordConfirm") {
          setConfirmError(message);
        } else if (field === "foundingCode") {
          setFoundingError(message);
        } else {
          setFormError(message);
        }
        return;
      }
      if (data.needsPayment) {
        setPaymentPending(true);
        if (data.checkout?.razorpayKeyId && data.checkout?.subscriptionId) {
          try {
            await openCheckout(data.checkout);
          } catch (err) {
            setFormError(err instanceof Error ? err.message : "Could not open payment");
          }
        } else {
          setFormError("Finish payment to start your trial");
        }
        return;
      }
      router.replace("/onboarding?signedup=1");
      router.refresh();
    } catch {
      setFormError("Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  if (paymentPending) {
    return (
      <div
        className="auth-copy w-full max-w-md rounded-xl p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="mb-6 text-center">
          <h1 className="mt-2 text-xl font-semibold">Finish payment to start your trial</h1>
          <p className="mt-2">
            Pilot setup is ₹4,999. Monthly billing starts on 1 January 2027. Your price is locked for
            12 monthly charges.
          </p>
        </div>
        {formError && <p className="auth-error mb-3">{formError}</p>}
        <button
          type="button"
          disabled={paying}
          onClick={() => void retryPayment()}
          className="mt-2 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          {paying ? "Opening payment…" : "Retry payment"}
        </button>
        <p className="mt-4 text-center">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="auth-copy w-full max-w-md rounded-xl p-8"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-6 text-center">
        <span className="text-3xl" role="img" aria-label="bar">
          🍶
        </span>
        <h1 className="mt-2 text-xl font-semibold">Create your account</h1>
        <p className="mt-1">BarTally, manage your venue stock</p>
      </div>

      <div className="grid gap-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-medium">Plan</legend>
          {(
            [
              ["ESSENTIALS", "Essentials · ₹999 / month"],
              ["PRO", "Pro · ₹1,299 / month"],
              ["CHAINS", "Chains · ₹1,599 / outlet / month"],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="plan"
                checked={plan === id}
                onChange={() => setPlan(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {plan === "CHAINS" ? (
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Outlets</span>
            <input
              type="number"
              min={1}
              max={99}
              value={outlets}
              onChange={(e) => setOutlets(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
              }}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Founding bar code (optional)</span>
          <input
            type="text"
            autoComplete="off"
            value={foundingCode}
            onChange={(e) => {
              setFoundingCode(e.target.value);
              if (foundingError) setFoundingError("");
            }}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: `1px solid ${foundingError ? "var(--red)" : "var(--border)"}`,
            }}
          />
          {foundingError && <p className="auth-error text-sm">{foundingError}</p>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError("");
            }}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: `1px solid ${emailError ? "var(--red)" : "var(--border)"}`,
            }}
          />
          {emailError && <p className="auth-error text-sm">{emailError}</p>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Phone number</span>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError("");
            }}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: `1px solid ${phoneError ? "var(--red)" : "var(--border)"}`,
            }}
          />
          {phoneError && <p className="auth-error text-sm">{phoneError}</p>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Password</span>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            hasError={!!passwordError}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError("");
            }}
          />
          {passwordError && <p className="auth-error text-sm">{passwordError}</p>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">Confirm password</span>
          <PasswordInput
            autoComplete="new-password"
            value={passwordConfirm}
            hasError={!!confirmError}
            onChange={(e) => {
              setPasswordConfirm(e.target.value);
              if (confirmError) setConfirmError("");
            }}
          />
          {confirmError && <p className="auth-error text-sm">{confirmError}</p>}
        </label>
      </div>

      {formError && <p className="auth-error mt-3">{formError}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p className="mt-4 text-center">
        Free until 31 December 2026. Pilot bars pay ₹4,999 setup now. Founding bars skip setup.
      </p>

      <p className="mt-4 text-center">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
