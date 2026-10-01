import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact BarTally — address, email, and Udyam registration.",
};

export default function ContactPage() {
  return (
    <LandingSiteChrome>
      <article className="lp-legal">
        <p className="lp-eyebrow">Contact</p>
        <h1 className="lp-h2">BarTally</h1>
        <p className="lp-legal-lead">Proprietor: Roshan Singh</p>
        <dl className="lp-legal-dl">
          <div>
            <dt>Address</dt>
            <dd>
              Flat No. 22, Narturanga Building, Sector 5, Srishti Complex, Near ICICI Bank, Mira
              Road East, Thane, Maharashtra 401107
            </dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>
            </dd>
          </div>
          <div>
            <dt>Udyam Registration</dt>
            <dd>UDYAM-MH-33-0835794</dd>
          </div>
        </dl>
      </article>
    </LandingSiteChrome>
  );
}
