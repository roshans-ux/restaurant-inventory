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

const COMPARE_ROWS = [
  {
    feature: "Stock tracking",
    bartally: "Every bottle from storeroom to bar",
    other: "Based on what was billed",
    manual: "Clipboard and memory",
  },
  {
    feature: "Slippage detection",
    bartally: "Flagged automatically when bottle closes",
    other: "Only during manual count",
    manual: "Found weeks later in P&L",
  },
  {
    feature: "Bottle handover",
    bartally: "Logged with barcode and timestamp",
    other: "Not tracked",
    manual: "Verbal, unrecorded",
  },
  {
    feature: "Shift report",
    bartally: "Auto-generated before every count",
    other: "Not available",
    manual: "Manual calculation",
  },
  {
    feature: "Vendor reordering",
    bartally: "Auto-created when stock hits par level",
    other: "Not available",
    manual: "Phone call when remembered",
  },
  {
    feature: "Built for",
    bartally: "Alcohol inventory in Indian bars",
    other: "Billing and sales",
    manual: "General stock keeping",
  },
] as const;

const SLIPPAGE_BUCKETS = [
  {
    id: "excellent",
    name: "Excellent Control",
    range: "0% – 5%",
    ml: "0 – 1.5ml",
    description: "Tight portion controls, strict jigger use, automated tracking.",
    midpoint: 0.025,
    color: "#4caf50",
  },
  {
    id: "standard",
    name: "Standard / Acceptable",
    range: "5% – 15%",
    ml: "1.5ml – 4.5ml",
    description: "Minor overpouring, accidental drips, occasional untracked pours.",
    midpoint: 0.1,
    color: "#f5a623",
  },
  {
    id: "average",
    name: "Industry Average",
    range: "20% – 25%",
    ml: "6ml – 7.5ml",
    description: "Free pouring by eye, heavy handed bartenders, unrecorded spills.",
    midpoint: 0.225,
    color: "#e07820",
  },
  {
    id: "critical",
    name: "Critical Failure",
    range: "30%+",
    ml: "9ml+",
    description: "Chronic overpouring, bartender drinking, or active theft.",
    midpoint: 0.3,
    color: "#e05c5c",
  },
] as const;

function formatRupeesCompact(value: number): string {
  const n = Math.max(0, value);
  if (n >= 100000) {
    const lakhs = n / 100000;
    const str = lakhs >= 10 ? String(Math.round(lakhs)) : lakhs.toFixed(1).replace(/\.0$/, "");
    return `₹${str}L`;
  }
  if (n >= 1000) {
    const thousands = n / 1000;
    const str =
      thousands >= 100 ? String(Math.round(thousands)) : thousands.toFixed(1).replace(/\.0$/, "");
    return `₹${str}K`;
  }
  return `₹${Math.round(n)}`;
}

function SlippageCalculator() {
  const [bottles, setBottles] = useState(100);
  const [cost, setCost] = useState(1500);
  const [bucketId, setBucketId] = useState<(typeof SLIPPAGE_BUCKETS)[number]["id"]>("average");
  const bucket = SLIPPAGE_BUCKETS.find((b) => b.id === bucketId) ?? SLIPPAGE_BUCKETS[2];
  const safeBottles = Math.max(1, bottles);
  const safeCost = Math.max(1, cost);
  const monthly = safeBottles * safeCost * bucket.midpoint;
  const annual = monthly * 12;
  const bottlesLost = safeBottles * bucket.midpoint;

  return (
    <div className="lp-calc-layout" data-reveal>
      <div className="lp-calc-inputs">
        <label className="lp-calc-field">
          <span>Bottles ordered per month</span>
          <input
            type="number"
            min={1}
            value={bottles}
            onChange={(e) => setBottles(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="lp-calc-field">
          <span>Average cost per bottle (₹)</span>
          <input
            type="number"
            min={1}
            value={cost}
            onChange={(e) => setCost(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <div className="lp-calc-buckets">
          <p className="lp-calc-label">Where does your bar sit?</p>
          {SLIPPAGE_BUCKETS.map((item) => {
            const selected = item.id === bucketId;
            return (
              <button
                key={item.id}
                type="button"
                className={`lp-calc-bucket${selected ? " is-selected" : ""}`}
                style={
                  selected
                    ? {
                        borderColor: item.color,
                        background: `${item.color}18`,
                      }
                    : undefined
                }
                onClick={() => setBucketId(item.id)}
              >
                <p
                  className="lp-calc-bucket-name"
                  style={{ color: selected ? item.color : undefined }}
                >
                  {item.name}
                </p>
                <div className="lp-calc-pills">
                  <span>{item.range}</span>
                  <span>{item.ml}</span>
                </div>
                <p>{item.description}</p>
              </button>
            );
          })}
        </div>
      </div>
      <div className="lp-calc-results">
        <div className="lp-calc-card">
          <div className="lp-calc-stat">
            <p className="lp-calc-stat-label">Lost every month</p>
            <p className="lp-calc-stat-month">{formatRupeesCompact(monthly)}</p>
          </div>
          <div className="lp-calc-stat">
            <p className="lp-calc-stat-label">Lost every year</p>
            <p className="lp-calc-stat-year">{formatRupeesCompact(annual)}</p>
          </div>
          <div className="lp-calc-stat">
            <p className="lp-calc-stat-label">Bottles unaccounted for monthly</p>
            <p className="lp-calc-stat-year">{bottlesLost.toFixed(1)} bottles</p>
          </div>
          <p className="lp-calc-context">
            Most bars don&apos;t know this number. BarTally surfaces it automatically, every shift,
            so you take action before it costs you further.
          </p>
          <Link href="/signup" className="lp-calc-cta">
            Start tracking for free →
          </Link>
        </div>
      </div>
    </div>
  );
}

const FAQS = [
  {
    q: "Do I need to replace my existing POS system?",
    a: "No. Bar Tally connects to your existing POS via a webhook. Your team keeps using the POS they know. Our system listens in the background and updates inventory automatically with every sale.",
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
          <span>Bar Tally</span>
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
              <span>Bar Tally</span>
              <span aria-hidden>Bar Tally</span>
              <span aria-hidden>Bar Tally</span>
              <span aria-hidden>Bar Tally</span>
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
              Bar Tally is built for the realities of running a bar in India. Every bottle
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

      <section className="lp-section" id="why-choose-us">
        <p className="lp-eyebrow" data-reveal>
          WHY CHOOSE US
        </p>
        <h2 className="lp-h2" data-reveal>
          Most bars already track sales. BarTally tracks what actually happened to the bottle.
        </h2>
        <div className="lp-compare-wrap" data-reveal>
          <table className="lp-compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="lp-sr-only">Feature</span>
                </th>
                <th scope="col">BarTally</th>
                <th scope="col">Other Inventory Tools</th>
                <th scope="col">Manual Counting</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  <td>
                    <span className="lp-compare-mark lp-compare-mark-yes" aria-hidden>
                      ✓
                    </span>
                    {row.bartally}
                  </td>
                  <td>
                    <span className="lp-compare-mark lp-compare-mark-mid" aria-hidden>
                      ~
                    </span>
                    {row.other}
                  </td>
                  <td>
                    <span className="lp-compare-mark lp-compare-mark-no" aria-hidden>
                      ×
                    </span>
                    {row.manual}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lp-compare-caption" data-reveal>
          If your POS already tracks inventory, you know what was sold. BarTally tells you what was
          lost.
        </p>
      </section>

      <section className="lp-section" id="slippage-calculator">
        <p className="lp-eyebrow" data-reveal>
          FREE TOOL
        </p>
        <h2 className="lp-h2" data-reveal>
          See what slippage is costing your bar.
        </h2>
        <p className="lp-calc-sub" data-reveal>
          Enter your numbers, pick where your bar honestly sits, and see the monthly cost of
          untracked alcohol.
        </p>
        <SlippageCalculator />
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
          <span>Bar Tally</span>
          <span>© 2026</span>
        </div>
        <span>Indian bars run differently. So does BarTally.</span>
      </footer>
    </div>
  );
}
