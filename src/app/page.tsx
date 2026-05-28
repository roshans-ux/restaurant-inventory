import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import LandingPage from "@/components/landing/LandingPage";

const landingDisplay = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-landing-display",
});

const landingBody = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-landing-body",
});

export const metadata: Metadata = {
  title: "Bar Inventory — Stock control built for bars",
  description:
    "Low stock alerts, POS-connected auto-deduction, and pour variance detection for modern bars.",
};

export default function Home() {
  return (
    <div className={`${landingDisplay.variable} ${landingBody.variable}`}>
      <LandingPage />
    </div>
  );
}
