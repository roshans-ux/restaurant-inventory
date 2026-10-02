"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Wine, X } from "lucide-react";

export const LANDING_NAV = [
  { href: "/#about", label: "About", num: "01" },
  { href: "/#how-it-works", label: "How it works", num: "02" },
  { href: "/#features", label: "Features", num: "03" },
  { href: "/pricing", label: "Pricing", num: "04" },
  { href: "/slippage-calculator", label: "Slippage Calculator", num: "05" },
  { href: "/#faq", label: "FAQ", num: "06" },
] as const;

export default function LandingNav({ ariaLabel = "Sections" }: { ariaLabel?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="lp-nav">
      <Link href="/" className="lp-logo" onClick={() => setOpen(false)}>
        <Wine size={18} strokeWidth={2} />
        <span>BarTally</span>
      </Link>
      <nav className="lp-nav-links" aria-label={ariaLabel}>
        {LANDING_NAV.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
            <sup>{item.num}</sup>
          </Link>
        ))}
      </nav>
      <nav className="lp-nav-actions">
        <Link href="/login" className="lp-btn lp-btn-ghost">
          Log in
        </Link>
        <Link href="/signup" className="lp-btn lp-btn-primary">
          Sign up
        </Link>
        <button
          type="button"
          className="lp-nav-menu-btn"
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
          <span className="lp-sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </nav>
      <div
        id="lp-mobile-menu"
        className={`lp-mobile-menu${open ? " is-open" : ""}`}
        hidden={!open}
      >
        <nav aria-label="Mobile">
          {LANDING_NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              <sup>{item.num}</sup>
              {item.label}
            </Link>
          ))}
          <div className="lp-mobile-menu-actions">
            <Link href="/login" className="lp-btn lp-btn-ghost" onClick={() => setOpen(false)}>
              Log in
            </Link>
            <Link href="/signup" className="lp-btn lp-btn-primary" onClick={() => setOpen(false)}>
              Sign up
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
