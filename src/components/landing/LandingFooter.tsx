import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <strong>BarTally</strong>
        <a className="lp-footer-mail" href="mailto:roshan@bartally.in">
          roshan@bartally.in
        </a>
      </div>
      <nav className="lp-footer-links" aria-label="Site">
        <Link href="/">Home</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/slippage-calculator">Slippage Calculator</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  );
}
