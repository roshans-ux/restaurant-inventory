import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";

export const metadata: Metadata = {
  title: "Delivery policy",
  description: "How BarTally is delivered. Access is online. No physical goods are shipped.",
};

export default function DeliveryPage() {
  return (
    <LandingSiteChrome>
      <article className="lp-legal">
        <p className="lp-eyebrow">Delivery policy</p>
        <h1 className="lp-h2">How you get BarTally</h1>
        <p className="lp-legal-lead">Effective date: 5 October 2026</p>

        <h2>Online delivery</h2>
        <p>
          BarTally is delivered online. It is a software service. You access it through your web
          browser after we enable your account.
        </p>

        <h2>When you get access</h2>
        <p>
          Access is given by email within 24 hours of payment or account approval.
        </p>

        <h2>No physical goods</h2>
        <p>No physical goods are shipped.</p>

        <h2>Contact</h2>
        <p>
          If you have not received access, email{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>
      </article>
    </LandingSiteChrome>
  );
}
