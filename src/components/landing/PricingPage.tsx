"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

const TIERS = [
  {
    id: "essentials",
    name: "Essentials",
    popular: false,
    monthly: 999,
    standard: 1999,
    perOutlet: false,
    blurb: "For bars that want control over their stock.",
    headline: null as string | null,
    subline: null as string | null,
    cta: { href: "/signup?plan=essentials", label: "Start free trial" },
    features: [
      { text: "Bottle-level inventory tracking" },
      { text: "Automatic slippage detection (overpour and underpour)" },
      { text: "Shift reports" },
      { text: "Past sales import from your POS" },
      { text: "Email orders to vendors" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    popular: true,
    monthly: 1299,
    standard: 3999,
    perOutlet: false,
    blurb: null,
    headline: "Run your bar's stock from your phone.",
    subline: "BarTally becomes your hub on WhatsApp.",
    cta: { href: "/signup?plan=pro", label: "Start free trial" },
    features: [
      { text: "Everything in Essentials" },
      { text: "Stock forecasting: know what runs out and when" },
      { text: "Morning updates and weekly slippage reports on WhatsApp", tag: "Coming soon" },
      { text: "Approve orders from your phone", tag: "Coming soon" },
      { text: "Payment reminders for vendor bills" },
      { text: "Orders sent to vendors on WhatsApp", tag: "Coming soon" },
    ],
  },
  {
    id: "chains",
    name: "Chains",
    popular: false,
    monthly: 1599,
    standard: 3499,
    perOutlet: true,
    blurb: "For 3 or more outlets.",
    headline: null,
    subline: null,
    cta: { href: "/signup?plan=chains", label: "Start free trial" },
    features: [
      { text: "Pro for every outlet" },
      { text: "Group view across all outlets", tag: "Coming soon" },
      { text: "Priority support" },
    ],
  },
] as const;

const FAQS = [
  {
    q: "Are taxes included?",
    a: "Yes, the price you see is the price you pay.",
  },
  {
    q: "What does setup include?",
    a: "Bottle catalog, vendors, POS mapping, and past sales import. We set everything up for you. Pilot setup is ₹4,999 (usually ₹7,500). Founding bars have setup waived.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes, anytime.",
  },
  {
    q: "Do I need WhatsApp for Pro?",
    a: "Yes, the owner's WhatsApp number receives updates and approvals.",
  },
  {
    q: "What happens after 31 December?",
    a: "Your first monthly charge is on 1 January 2027, at the pilot price shown on this page. That price is locked for 12 monthly charges. Founding bars pay ₹999/month on any plan from 1 January 2027, with setup waived.",
  },
  {
    q: "How do founding bars sign up?",
    a: "Enter a valid founding bar code on the signup form. Setup is waived and there is no payment at signup. Pilot prices on this page apply when you do not have a code.",
  },
];

function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".lp-pricing-page [data-reveal]"));
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
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`lp-pricing-page${ready ? " is-ready" : ""}`}>
      <section className="lp-section lp-pricing-hero">
        <p className="lp-eyebrow" data-reveal>
          Pricing
        </p>
        <h1 className="lp-h2" data-reveal>
          Plans for a tighter bar.
        </h1>
        <p className="lp-pricing-lede" data-reveal>
          Free until 31 December 2026. Pilot prices locked for 12 months from 1 January 2027.
        </p>
      </section>

      <section className="lp-section lp-pricing-cards-wrap">
        <div className="lp-trial-banner" data-reveal>
          <p>Free until 31 December 2026. Every feature during the trial.</p>
          <p className="lp-trial-banner-sub">
            Pilot setup ₹4,999 (usually ₹7,500), waived for founding bars. Pilot prices locked for
            12 months. Founding bars pay ₹999/month on any plan from 1 January 2027, with no
            payment at signup.
          </p>
        </div>
        <div className="lp-pricing-grid">
          {TIERS.map((tier, index) => {
            const period = tier.perOutlet ? "/outlet/month" : "/month";
            return (
              <article
                key={tier.id}
                className={`lp-price-card${tier.popular ? " is-popular" : ""}`}
                data-reveal
                style={{ transitionDelay: `${index * 0.08}s` }}
              >
                {tier.popular ? <p className="lp-price-badge">Most popular</p> : null}
                <h2>{tier.name}</h2>
                {tier.headline ? <p className="lp-price-headline">{tier.headline}</p> : null}
                {tier.subline ? <p className="lp-price-subline">{tier.subline}</p> : null}
                {tier.blurb ? <p className="lp-price-blurb">{tier.blurb}</p> : null}
                <p className="lp-price-amount">
                  <s className="lp-price-was">{inr(tier.standard)}</s>
                  <span>{inr(tier.monthly)}</span>
                  <small>{period}</small>
                </p>
                <p className="lp-price-tax">All taxes included. Pilot price locked for 12 months.</p>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature.text}>
                      <span>{feature.text}</span>
                      {"tag" in feature && feature.tag ? (
                        <em className="lp-soon">{feature.tag}</em>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className={`lp-btn ${tier.popular ? "lp-btn-primary" : "lp-btn-ghost"} lp-price-cta`}
                >
                  {tier.cta.label}
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-section lp-setup" data-reveal>
        <h2 className="lp-h2 lp-setup-title">
          Pilot setup ₹4,999 (usually ₹7,500), waived for founding bars
        </h2>
        <p className="lp-setup-lead">We set everything up for you.</p>
        <ul className="lp-setup-list">
          <li>Bottle catalog</li>
          <li>Vendors</li>
          <li>POS mapping</li>
          <li>Past sales import</li>
        </ul>
      </section>

      <section className="lp-cta lp-pricing-worth">
        <h2 data-reveal>Not sure yet?</h2>
        <p className="lp-cta-sub" data-reveal>
          Run the numbers on what untracked pours actually cost.
        </p>
        <div data-reveal>
          <Link href="/slippage-calculator" className="lp-btn lp-btn-primary lp-btn-lg">
            Is the price worth it?
          </Link>
        </div>
      </section>

      <section className="lp-section" id="pricing-faq">
        <div className="lp-section-head" data-reveal>
          <span className="lp-index">(FAQ)</span>
          <span>(Pricing)</span>
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
                  aria-controls={`pricing-faq-${index}`}
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                >
                  <span>{faq.q}</span>
                  <ChevronDown className="lp-faq-icon" size={20} strokeWidth={2} />
                </button>
                <div
                  id={`pricing-faq-${index}`}
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
    </div>
  );
}
