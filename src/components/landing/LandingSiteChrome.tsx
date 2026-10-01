import Link from "next/link";
import { Wine } from "lucide-react";
import ThemeLightDocument from "@/components/ThemeLightDocument";
import LandingFooter from "@/components/landing/LandingFooter";
import "./landing.css";

export default function LandingSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-root theme-light is-ready">
      <ThemeLightDocument />
      <header className="lp-nav">
        <Link href="/" className="lp-logo">
          <Wine size={18} strokeWidth={2} />
          <span>Bar Tally</span>
        </Link>
        <nav className="lp-nav-links" aria-label="Legal">
          <Link href="/contact">
            Contact
            <sup>01</sup>
          </Link>
          <Link href="/privacy">
            Privacy
            <sup>02</sup>
          </Link>
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
      {children}
      <LandingFooter />
    </div>
  );
}
