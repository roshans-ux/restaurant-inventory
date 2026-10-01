import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How BarTally collects, uses, and protects venue and account data.",
};

export default function PrivacyPage() {
  return (
    <LandingSiteChrome>
      <article className="lp-legal">
        <p className="lp-eyebrow">Privacy Policy</p>
        <h1 className="lp-h2">How BarTally handles your data</h1>
        <p className="lp-legal-lead">Effective date: 1 October 2026</p>

        <h2>What we collect</h2>
        <p>
          BarTally collects the information needed to run your venue account. That includes account
          details such as name, email, and login credentials; venue stock and sales data you enter
          or import (inventory levels, products, vendors, and POS sales); and WhatsApp numbers you
          save for operational notifications such as order approvals and restock alerts.
        </p>

        <h2>How we use it</h2>
        <p>
          We use this data to provide inventory tracking, generate forecasts, and send alerts you
          have asked for. We do not use venue stock, sales, or WhatsApp numbers for advertising.
        </p>

        <h2>Sharing</h2>
        <p>
          We do not sell your data, and we do not share it for marketing. We only share information
          when it is required to operate the product (for example sending a WhatsApp message you
          triggered, or emailing a vendor order you approved) or when the law requires it.
        </p>

        <h2>Deletion</h2>
        <p>
          To request deletion of your account and associated venue data, email{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>. We will confirm when the
          request has been completed.
        </p>
      </article>
    </LandingSiteChrome>
  );
}
