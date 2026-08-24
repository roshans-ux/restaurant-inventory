import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Bar Tally — Stock control built for bars",
  description:
    "Low stock alerts, POS-connected auto-deduction, and pour variance detection for modern bars.",
};

export default function Home() {
  return <LandingPage />;
}
