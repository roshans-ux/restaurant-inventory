import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";
import PricingPage from "@/components/landing/PricingPage";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "BarTally plans for Indian bars. Essentials, Pro, and Chains. All taxes included. Free setup on annual plans.",
};

export default function PricingRoute() {
  return (
    <LandingSiteChrome>
      <PricingPage />
    </LandingSiteChrome>
  );
}
