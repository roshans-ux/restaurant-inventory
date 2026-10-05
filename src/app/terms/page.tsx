import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";

export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "Terms for using BarTally, a subscription software service.",
};

export default function TermsPage() {
  return (
    <LandingSiteChrome>
      <article className="lp-legal">
        <p className="lp-eyebrow">Terms and conditions</p>
        <h1 className="lp-h2">Terms for using BarTally</h1>
        <p className="lp-legal-lead">Effective date: 5 October 2026</p>

        <h2>Who we are</h2>
        <p>
          BarTally is a subscription software service provided by BarTally, a sole proprietorship
          based in Mumbai, India.
        </p>

        <h2>Who can use it</h2>
        <p>
          You may use BarTally if you operate a bar, restaurant, or similar venue and can enter a
          contract under Indian law. If you use BarTally for a business, you confirm you have
          authority to bind that business to these terms.
        </p>

        <h2>Your account</h2>
        <p>
          You are responsible for your account, the people you invite, and all activity under your
          login. Keep your password and access secure. Email us at{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a> if you think someone used your
          account without permission.
        </p>

        <h2>Subscription and billing</h2>
        <p>
          BarTally is billed monthly or annually. The price shown on the pricing page is the price
          you pay. Prices include taxes. You pay in advance for each billing period. If you do not
          pay, we may suspend or close the account.
        </p>

        <h2>Free trial</h2>
        <p>
          Until 31 December 2026 you can use BarTally free of charge. No payment and no card are
          required for the trial. Nothing is charged automatically. We will contact you before the
          trial ends to help you pick a plan. Paid plans apply from 1 January 2027 as listed on the
          pricing page.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Use BarTally only for lawful venue operations. Do not try to break into the service,
          interfere with other customers, copy the product in a way that harms it, or use it to send
          spam or illegal content. We may suspend accounts that break these rules.
        </p>

        <h2>Data ownership</h2>
        <p>
          The bar owns its data. Stock, sales, products, vendors, and related venue records you put
          into BarTally remain yours. We process that data only to provide the service. You can ask
          for a copy or deletion by emailing{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>

        <h2>Service availability</h2>
        <p>
          We run BarTally on a best-effort basis. We do not guarantee uninterrupted or error-free
          service. We may take the product down for maintenance, incidents, or changes. We will try
          to keep disruption short.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the extent the law allows, BarTally is not liable for lost profits, lost stock, lost
          data, or other indirect loss. Our total liability for a claim is limited to the fees you
          paid us for the service in the three months before the claim.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using BarTally and ask us to close your account at any time. We may suspend
          or end the service if you break these terms, do not pay, or if we stop offering the
          product. After closure we handle data as described in the{" "}
          <a href="/privacy">Privacy Policy</a>. Cancellation and refunds are described in the{" "}
          <a href="/refunds">Refund and cancellation policy</a>.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of India. Courts in Mumbai have exclusive
          jurisdiction over disputes, subject to any rights you have under applicable law.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>
      </article>
    </LandingSiteChrome>
  );
}
