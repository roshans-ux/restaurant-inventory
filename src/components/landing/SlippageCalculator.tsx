"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export const SLIPPAGE_BUCKETS = [
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

export default function SlippageCalculator({
  afterResult,
}: {
  afterResult?: ReactNode;
}) {
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
    <div className="lp-calc-layout">
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
          {afterResult}
        </div>
      </div>
    </div>
  );
}
