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
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms and conditions</Link>
        <Link href="/refunds">Refund and cancellation policy</Link>
        <Link href="/delivery">Delivery policy</Link>
      </nav>
    </footer>
  );
}
