"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, CornerDownRight, Wine } from "lucide-react";
import ThemeLightDocument from "@/components/ThemeLightDocument";
import "./landing.css";

const UNSPLASH = {
  hero: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1800&q=75",
  storeroom:
    "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=70",
  scan: "https://images.unsplash.com/photo-1517620430776-0ec904756579?auto=format&fit=crop&w=800&q=70",
  pos: "https://images.unsplash.com/photo-1538488881038-e252a119ace7?auto=format&fit=crop&w=800&q=70",
  close:
    "https://images.unsplash.com/photo-1481833761820-0509d3217039?auto=format&fit=crop&w=800&q=70",
};

const HERO_NAV = [
  { href: "#about", label: "About", num: "01" },
  { href: "#how-it-works", label: "How it works", num: "02" },
  { href: "#features", label: "Features", num: "03" },
  { href: "#faq", label: "FAQ", num: "04" },
];

const STEPS = [
  {
    num: "01",
    title: "Scan the bottle",
    body: "When a bottle goes to the bar, the storekeeper scans its barcode. The system logs it as in rotation and starts tracking every pour against it automatically.",
    image: UNSPLASH.scan,
    alt: "Bottles and glassware on a dark bar counter",
  },
  {
    num: "02",
    title: "POS does the rest",
    body: "Every order punched on your POS deducts the right ml from the right bottle in real time. No manual entry. No end of night reconciliation from memory.",
    image: UNSPLASH.pos,
    alt: "Warmly lit bar counter during service",
  },
  {
    num: "03",
    title: "Close the shift clean",
    body: "At end of shift, generate a report that tells your storekeeper exactly what to expect during the physical count. Slippage is flagged automatically.",
    image: UNSPLASH.close,
    alt: "Bar window at the end of the night",
  },
];

const FEATURES = [
  {
    title: "Low stock alerts",
    body: "Know when a bottle hits your par level before the Friday rush — not after the well runs dry.",
  },
  {
    title: "POS-connected inventory",
    body: "Every sale on your POS shaves the right ml off the right bottle automatically. No manual entry.",
  },
  {
    title: "Bottle rotation tracking",
    body: "Log which bottle goes to the bar. When the next one goes out, slippage is calculated automatically.",
  },
  {
    title: "Slippage detection",
    body: "If a bottle loses more than your set tolerance, the system flags it. Slippage shows up as data, not mystery shrinkage.",
  },
  {
    title: "Shift report",
    body: "At end of shift, download an Excel report that tells your storekeeper exactly what to expect during the physical count.",
  },
  {
    title: "Smart reordering",
    body: "When stock drops below par, a pending order is created automatically. Send your vendor a message in one click.",
  },
  {
    title: "Cocktail ingredient tracking",
    body: "Map cocktails to their alcohol ingredients. Every cocktail order deducts from the right bottles at the right quantities.",
  },
  {
    title: "Barcode scanner ready",
    body: "Works with any USB barcode scanner out of the box. Storekeepers scan bottles into rotation in seconds.",
  },
];

const FAQS = [
  {
    q: "Do I need to replace my existing POS system?",
    a: "No. Bar Inventory connects to your existing POS via a webhook. Your team keeps using the POS they know. Our system listens in the background and updates inventory automatically with every sale.",
  },
  {
    q: "What if my bar doesn't have a barcode scanner?",
    a: "Any USB barcode scanner works plug-and-play since it acts like a keyboard. You can also type barcodes manually. We recommend a basic scanner for speed but it is not required to get started.",
  },
  {
    q: "How does slippage detection work?",
    a: "When a bottle is put into rotation, the system tracks every ml sold through the POS against that bottle. When the next bottle is scanned in, the system compares what was sold against the bottle size and flags any variance above your set tolerance.",
  },
  {
    q: "Can I track cocktails, not just straight pours?",
    a: "Yes. You can map any cocktail on your POS menu to its alcohol ingredients and quantities. Every cocktail sale automatically deducts from each ingredient bottle.",
  },
  {
    q: "Is my data private and secure?",
    a: "Each venue has its own isolated account. Your inventory data, sales history, and reports are never shared with other venues. All API connections use signed webhooks with HMAC verification.",
  },
  {
    q: "How long does setup take?",
    a: "Most venues are set up within a day. Add your bottles, map your POS items, connect your webhook, and you are live. We help you through every step during onboarding.",
  },
];

export default function LandingPage() {
  const [ready, setReady] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setReady(true);

    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`landing-root theme-light${ready ? " is-ready" : ""}`}>
      <ThemeLightDocument />

      <header className="lp-nav">
        <Link href="/" className="lp-logo">
          <Wine size={18} strokeWidth={2} />
          <span>Bar Inventory</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Sections">
          {HERO_NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
              <sup>{item.num}</sup>
            </a>
          ))}
        </nav>
        <nav className="lp-nav-actions">
          <Link href="/login" className="lp-btn lp-btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="lp-btn lp-btn-primary">
            Sign up
          </Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-media" aria-hidden>
          <Image
            src={UNSPLASH.hero}
            alt=""
            fill
            priority
            sizes="100vw"
            className="lp-hero-photo"
          />
        </div>
        <div className="lp-hero-scrim" aria-hidden />

        <div className="lp-hero-blend">
          <p className="lp-hero-micro">
            01/ Bottles
            <br />
            Pours
            <br />
            Shifts
          </p>
          <h1 className="lp-hero-wordmark">
            <span className="lp-marquee-track">
              <span>Bar Inventory</span>
              <span aria-hidden>Bar Inventory</span>
              <span aria-hidden>Bar Inventory</span>
              <span aria-hidden>Bar Inventory</span>
            </span>
          </h1>
        </div>

        <div className="lp-hero-copy">
          <p className="lp-hero-lede">
            Track every bottle to the ml, catch slippage before it becomes loss,
            <span className="muted">
              {" "}
              and let your storekeeper run a tighter shift — without the spreadsheets.
            </span>
          </p>
          <div className="lp-hero-cta-row">
            <Link href="/signup" className="lp-hero-pill">
              Start free
            </Link>
            <Link href="/login" className="lp-hero-link">
              Log in
              <CornerDownRight size={12} strokeWidth={2.5} aria-hidden />
            </Link>
          </div>
          <div className="lp-hero-meta">
            <span>© 2026</span>
            <span className="lp-hero-ruler" aria-hidden>
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      </section>

      <section className="lp-section" id="about">
        <div className="lp-section-head" data-reveal>
          <span className="lp-index">(01)</span>
          <span>(About)</span>
        </div>
        <div className="lp-about-body">
          <div data-reveal>
            <p className="lp-about-text">
              Bar Inventory is built for the realities of running a bar in India. Every bottle
              tracked, every pour accounted for, every shift closed with confidence. We built this
              because inventory loss is not a mystery —{" "}
              <em className="lp-italic">it is a measurement problem.</em>
            </p>
            <div className="lp-stats">
              <div>
                <p className="lp-stat-value">1 bottle</p>
                <p className="lp-stat-label">tracked to the last ml</p>
              </div>
              <div>
                <p className="lp-stat-value">Every shift</p>
                <p className="lp-stat-label">closed with a report</p>
              </div>
            </div>
            <a href="#how-it-works" className="lp-textlink">
              See how it works →
            </a>
          </div>
          <div className="lp-portrait" data-reveal>
            <Image
              src={UNSPLASH.storeroom}
              alt="Bar storeroom shelf stacked with spirits"
              fill
              sizes="(max-width: 960px) 92vw, 34vw"
            />
          </div>
        </div>
      </section>

      <section className="lp-section" id="how-it-works">
        <div className="lp-section-head" data-reveal>
          <span className="lp-index">(02)</span>
          <span>(How It Works)</span>
        </div>
        <h2 className="lp-steps-intro" data-reveal>
          Three steps. No spreadsheets. <em className="lp-italic">No guessing.</em>
        </h2>
        <div className="lp-steps">
          {STEPS.map((step, index) => (
            <article
              className="lp-step"
              key={step.num}
              data-reveal
              style={{ transitionDelay: `${index * 0.1}s` }}
            >
              <span className="lp-step-num">{step.num}</span>
              <div className="lp-step-media">
                <Image src={step.image} alt={step.alt} fill sizes="(max-width: 960px) 78vw, 30vw" />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="features">
        <div className="lp-section-head" data-reveal>
          <span className="lp-index">(03)</span>
          <span>(Features)</span>
        </div>
        <h2 className="lp-h2" data-reveal>
          Stop guessing <em className="lp-italic">what&apos;s left</em> in the well.
        </h2>
        <div className="lp-feature-grid">
          {FEATURES.map((feature, index) => (
            <article
              className="lp-feature"
              key={feature.title}
              data-reveal
              style={{ transitionDelay: `${index * 0.1}s` }}
            >
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="faq">
        <div className="lp-section-head" data-reveal>
          <span className="lp-index">(04)</span>
          <span>(Frequently Asked Questions)</span>
        </div>
        <div className="lp-faq-list">
          {FAQS.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div className="lp-faq-item" key={faq.q} data-reveal>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  <span>{faq.q}</span>
                  <ChevronDown className="lp-faq-icon" size={20} strokeWidth={2} />
                </button>
                <div
                  id={`faq-panel-${index}`}
                  role="region"
                  className={`lp-faq-panel${isOpen ? " is-open" : ""}`}
                >
                  <div>
                    <p>{faq.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lp-cta">
        <h2 data-reveal>
          Your storekeeper&apos;s shift, <em className="lp-italic">sorted.</em>
        </h2>
        <p className="lp-cta-sub" data-reveal>
          Sign up, map your POS, and let the system do the counting.
        </p>
        <div data-reveal>
          <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
            Create your venue
          </Link>
          <p className="lp-cta-note">Free to start. No credit card required.</p>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-left">
          <span>Bar Inventory</span>
          <span>© 2026</span>
        </div>
        <span>Pour-level stock for modern bars</span>
      </footer>
    </div>
  );
}
