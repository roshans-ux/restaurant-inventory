import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <strong>BarTally</strong>
        <span>Udyam Registration: UDYAM-MH-33-0835794</span>
        <span>
          Email:{" "}
          <a className="lp-footer-mail" href="mailto:roshan@bartally.in">
            roshan@bartally.in
          </a>
        </span>
      </div>
      <nav className="lp-footer-links" aria-label="Legal">
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  );
}
