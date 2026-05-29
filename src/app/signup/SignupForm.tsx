"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  function clearErrors() {
    setEmailError("");
    setPhoneError("");
    setPasswordError("");
    setConfirmError("");
    setFormError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    clearErrors();

    let hasError = false;
    if (!isValidEmail(email)) {
      setEmailError("Invalid Email");
      hasError = true;
    }
    const phoneTrimmed = phone.trim();
    if (phoneTrimmed.length < 7 || !/^[+0-9()\-\s]+$/.test(phoneTrimmed)) {
      setPhoneError("Enter a valid phone number");
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
    if (hasError) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: phoneTrimmed, password, passwordConfirm }),
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
        } else {
          setFormError(message);
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
        <p className="mt-1">Bar Inventory — manage your venue stock</p>
      </div>

      <div className="grid gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Email
          </span>
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
          {emailError && (
            <p className="auth-error text-sm">
              {emailError}
            </p>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Phone number
          </span>
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
          {phoneError && (
            <p className="auth-error text-sm">
              {phoneError}
            </p>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Password
          </span>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            hasError={!!passwordError}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError("");
            }}
          />
          {passwordError && (
            <p className="auth-error text-sm">
              {passwordError}
            </p>
          )}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Confirm password
          </span>
          <PasswordInput
            autoComplete="new-password"
            value={passwordConfirm}
            hasError={!!confirmError}
            onChange={(e) => {
              setPasswordConfirm(e.target.value);
              if (confirmError) setConfirmError("");
            }}
          />
          {confirmError && (
            <p className="auth-error text-sm">
              {confirmError}
            </p>
          )}
        </label>
      </div>

      {formError && (
        <p className="auth-error mt-3">{formError}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p className="mt-4 text-center">
        We are in beta right now. We will approve your account and confirm on your number when
        it&apos;s live. Usually takes less than a couple of hours.
      </p>

      <p className="mt-4 text-center">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
