import type { Metadata } from "next";
import LandingSiteChrome from "@/components/landing/LandingSiteChrome";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description: "How cancellation and refunds work for BarTally subscriptions.",
};

export default function RefundsPage() {
  return (
    <LandingSiteChrome>
      <article className="lp-legal">
        <p className="lp-eyebrow">Refund and cancellation policy</p>
        <h1 className="lp-h2">Cancelling and getting a refund</h1>
        <p className="lp-legal-lead">Effective date: 5 October 2026</p>

        <h2>How to cancel</h2>
        <p>
          You can cancel anytime from your account or by emailing{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>

        <h2>What happens after you cancel</h2>
        <p>
          After cancelling, your plan stays active until the end of the period you have paid for.
          Then access to the paid plan ends.
        </p>

        <h2>Refunds</h2>
        <p>
          We do not give refunds for the current period, monthly or annual. The one-time setup fee
          is non-refundable once setup has started.
        </p>
        <p>
          If you were charged by mistake (for example, a duplicate payment), contact us and we will
          refund it within 7 to 10 working days.
        </p>

        <h2>Your data after cancellation</h2>
        <p>
          After cancellation, your data stays available to download for 90 days, then it is deleted.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about cancellation or a mistaken charge:{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>
      </article>
    </LandingSiteChrome>
  );
}
