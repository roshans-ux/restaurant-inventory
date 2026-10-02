import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";
import SlippageCalculator from "@/components/landing/SlippageCalculator";

export const metadata: Metadata = {
  title: "Slippage Calculator",
  description: "See how much untracked pours and overpouring may be costing your bar each month.",
};

export default function SlippageCalculatorPage() {
  return (
    <LandingSiteChrome>
      <section className="lp-section">
        <p className="lp-eyebrow">Free tool</p>
        <h1 className="lp-h2">How much is slippage costing your bar?</h1>
        <p className="lp-calc-sub">
          Enter your numbers, pick where your bar honestly sits, and see the monthly cost of
          untracked alcohol.
        </p>
        <SlippageCalculator />
      </section>
    </LandingSiteChrome>
  );
}
