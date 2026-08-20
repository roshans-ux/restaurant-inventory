import Link from "next/link";
import { getAppBaseUrl } from "@/lib/email/app-url";
import { CopyCodeBlock } from "./CopyCodeBlock";

const SIGNATURE_EXAMPLE = `const crypto = require('crypto');

const signature = crypto
  .createHmac('sha256', YOUR_WEBHOOK_SECRET)
  .update(rawJsonBody)
  .digest('hex');

// Add to request header as:
// x-pos-signature: <signature>`;

const PAYLOAD_EXAMPLE = `{
  "external_sale_id": "unique-sale-id-from-your-pos",
  "sold_at": "2026-08-20T18:30:00.000Z",
  "lines": [
    {
      "pos_item_id": "your-pos-item-id",
      "quantity": 1,
      "external_line_id": "unique-line-id"
    }
  ]
}`;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl p-5 space-y-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function DocTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--surface-elevated)", borderBottom: "1px solid var(--border)" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                background: "var(--surface-elevated)",
              }}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2.5 align-top ${j === 0 ? "font-mono text-xs" : "text-xs"}`}
                  style={{ color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMING_SOON_POS = ["Rista by DotPe", "Petpooja", "GoFrugal"];

export default function PosIntegrationDocsPage() {
  const endpointUrl = `${getAppBaseUrl()}/api/webhooks/pos/sale`;

  return (
    <div className="p-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold">POS Integration Guide</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          How to connect your Point of Sale system to Bar Inventory
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        <Section title="Prerequisites">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Before connecting your POS system, make sure you have the following ready:
          </p>
          <ul
            className="list-disc space-y-2 pl-5 text-sm leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            <li>
              Your POS system supports outbound webhooks (the ability to send a notification to an
              external URL when a sale is completed)
            </li>
            <li>
              Your Bar Inventory account is set up with at least one bottle and one POS mapping
              configured
            </li>
            <li>
              You have access to your Tenant API Key and POS Webhook Secret from the{" "}
              <Link href="/admin/settings" className="underline" style={{ color: "var(--accent)" }}>
                Settings
              </Link>{" "}
              page
            </li>
          </ul>
        </Section>

        <Section title="Webhook endpoint">
          <div className="space-y-3">
            <CopyCodeBlock label="Endpoint URL" value={endpointUrl} />
            <CopyCodeBlock label="Method" value="POST" />
            <CopyCodeBlock label="Content Type" value="application/json" />
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Your Tenant API Key and POS Webhook Secret are available on the{" "}
            <Link href="/admin/settings" className="underline" style={{ color: "var(--accent)" }}>
              Settings
            </Link>{" "}
            page.
          </p>
        </Section>

        <Section title="Authentication headers">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Every sale webhook must include these two headers:
          </p>
          <DocTable
            headers={["Header", "Value", "Description"]}
            rows={[
              [
                "x-tenant-api-key",
                "Your Tenant API Key from Settings",
                "Identifies which venue's inventory to update",
              ],
              [
                "x-pos-signature",
                "HMAC-SHA256 hex signature",
                "Verifies the request is genuine. Generated by signing the raw JSON request body using your POS Webhook Secret with HMAC-SHA256.",
              ],
            ]}
          />
          <CopyCodeBlock label="Node.js — generate signature" value={SIGNATURE_EXAMPLE} />
        </Section>

        <Section title="Sale payload structure">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Send a POST request with the following JSON structure:
          </p>
          <CopyCodeBlock value={PAYLOAD_EXAMPLE} />
          <DocTable
            headers={["Field", "Type", "Required", "Description"]}
            rows={[
              [
                "external_sale_id",
                "string",
                "Yes",
                "A unique ID for this sale from your POS system. Used for idempotency — duplicate sale IDs are ignored.",
              ],
              [
                "sold_at",
                "string (ISO 8601)",
                "Yes",
                "When the sale occurred, as an ISO 8601 datetime (for example 2026-08-20T18:30:00.000Z).",
              ],
              ["lines", "array", "Yes", "List of items sold in this transaction."],
              [
                "lines[].pos_item_id",
                "string",
                "Yes",
                "The POS item ID that matches a mapping configured in Bar Inventory.",
              ],
              ["lines[].quantity", "integer", "Yes", "Number of units sold."],
              [
                "lines[].external_line_id",
                "string",
                "Yes",
                "A unique ID for this line item from your POS system.",
              ],
            ]}
          />
        </Section>

        <Section title="API responses">
          <DocTable
            headers={["Status Code", "Meaning", "What to do"]}
            rows={[
              ["200 OK", "Sale accepted and inventory updated", "No action needed"],
              [
                "409 Conflict",
                "Insufficient stock for one or more items",
                "Check stock levels in Bar Inventory and restock before retrying",
              ],
              [
                "401 Unauthorized",
                "Invalid or missing authentication headers",
                "Check your Tenant API Key and Webhook Secret in Settings",
              ],
              [
                "400 Bad Request",
                "Malformed payload",
                "Check your JSON structure matches the format above",
              ],
              [
                "500 Server Error",
                "Internal error",
                "Retry after a few seconds. If persistent, contact support.",
              ],
            ]}
          />
        </Section>

        <Section title="Test before going live">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Before connecting your real POS, use the built-in POS Simulator to verify your mappings
            are working correctly.
          </p>
          <Link
            href="/admin/pos-sim"
            className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            Open POS Simulator →
          </Link>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The simulator fires a real signed webhook to the same endpoint your POS will use. If
            sales are deducting correctly in the simulator, your real POS integration will work the
            same way.
          </p>
        </Section>

        <Section title="Connecting specific POS systems">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Step-by-step guides for specific POS systems will be added here as integrations are
            verified.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {COMING_SOON_POS.map((name) => (
              <div
                key={name}
                className="rounded-lg px-4 py-4"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {name}
                </p>
                <span
                  className="mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                  }}
                >
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
