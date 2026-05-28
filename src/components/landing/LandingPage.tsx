"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Link2,
  Minus,
  Plus,
  TrendingDown,
  Wine,
} from "lucide-react";
import "./landing.css";

const USPS = [
  {
    icon: AlertTriangle,
    title: "Low stock alerts",
    body: "Know when a bottle hits your par level before the Friday rush — not after the well runs dry.",
  },
  {
    icon: Link2,
    title: "Direct connection to ordering system",
    body: "Link how you buy and how you sell — receive stock, map POS items, and keep one source of truth.",
  },
  {
    icon: TrendingDown,
    title: "Auto-deduction from orders",
    body: "Every signed POS sale shaves the right millilitres off the right bottle. No spreadsheet gymnastics.",
  },
  {
    icon: Minus,
    title: "Pour variance detection",
    body: "Flag underpour and overpour patterns so slippage shows up as data — not mystery shrinkage.",
  },
];

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        rafRef.current = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const parallax = (speed: number) => `translate3d(0, ${scrollY * speed}px, 0)`;

  return (
    <div className="landing-root">
      <div className="landing-grain" aria-hidden />

      <header className="landing-header">
        <Link href="/" className="landing-logo">
          <Wine size={18} strokeWidth={2} />
          <span>Bar Inventory</span>
        </Link>
        <nav className="landing-nav">
          <Link href="/login" className="landing-btn landing-btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="landing-btn landing-btn-primary">
            Sign up
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div
          className="landing-parallax-layer landing-hero-glow"
          style={{ transform: parallax(0.15) }}
          aria-hidden
        />
        <div
          className="landing-parallax-layer landing-hero-bokeh"
          style={{ transform: parallax(0.25) }}
          aria-hidden
        />

        <div className="landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Built for bars &amp; high-volume pours</p>
            <h1 className="landing-title">
              Inventory that moves
              <span className="landing-title-accent"> with every order.</span>
            </h1>
            <p className="landing-lead">
              Track bottles in millilitres, connect your POS, and catch low stock and pour variance
              before they cost you a service night.
            </p>
            <div className="landing-hero-cta">
              <Link href="/signup" className="landing-btn landing-btn-primary landing-btn-lg">
                Start free
              </Link>
              <Link href="/login" className="landing-btn landing-btn-ghost landing-btn-lg">
                Log in
              </Link>
            </div>
          </div>

          <div
            className="landing-hero-visual"
            style={{ transform: `${parallax(-0.08)} scale(1.02)` }}
          >
            <div className="landing-bottle-float landing-bottle-back" style={{ transform: parallax(-0.12) }}>
              <Image
                src="/images/landing/bottle-vodka.png"
                alt=""
                width={280}
                height={560}
                priority
                className="landing-bottle-img"
              />
            </div>
            <div className="landing-hero-frame">
              <Image
                src="/images/landing/hero-bottles.png"
                alt="Premium spirits on a bar"
                width={900}
                height={506}
                priority
                className="landing-hero-img"
              />
              <div className="landing-hero-shine" aria-hidden />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-usps">
        <div className="landing-section-head">
          <p className="landing-eyebrow">Why bars choose us</p>
          <h2 className="landing-h2">Stop guessing what&apos;s left in the well.</h2>
        </div>
        <div className="landing-usp-grid">
          {USPS.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              className="landing-usp-card"
              style={{ transform: parallax(-0.02 * (i + 1)) }}
            >
              <div className="landing-usp-icon">
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-pour">
        <div
          className="landing-pour-visual"
          style={{ transform: parallax(-0.06) }}
        >
          <div className="landing-pour-meter" aria-hidden>
            <div className="landing-pour-bar landing-pour-under">
              <Minus size={14} />
              <span>Underpour flagged</span>
            </div>
            <div className="landing-pour-bar landing-pour-expected">
              <span>Expected stock</span>
            </div>
            <div className="landing-pour-bar landing-pour-over">
              <Plus size={14} />
              <span>Overpour flagged</span>
            </div>
          </div>
        </div>
        <div className="landing-pour-copy">
          <p className="landing-eyebrow">Alcohol slippage prevention</p>
          <h2 className="landing-h2">See variance before it becomes loss.</h2>
          <p className="landing-body">
            When recorded pours don&apos;t match what&apos;s left in the bottle, Bar Inventory
            surfaces the gap. Underpour and overpour adjustments keep your ledger honest — built for
            teams that care about every 30ml.
          </p>
        </div>
      </section>

      <section className="landing-cta-band">
        <div
          className="landing-cta-glow"
          style={{ transform: parallax(0.1) }}
          aria-hidden
        />
        <h2>Run a tighter bar, starting tonight.</h2>
        <p>Sign up, map your POS, and pour with confidence.</p>
        <Link href="/signup" className="landing-btn landing-btn-primary landing-btn-lg">
          Create your venue
        </Link>
      </section>

      <footer className="landing-footer">
        <span>Bar Inventory</span>
        <span className="landing-footer-muted">Pour-level stock for modern bars</span>
      </footer>
    </div>
  );
}
