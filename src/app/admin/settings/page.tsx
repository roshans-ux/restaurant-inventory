"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

type TenantInfo = {
  name: string;
  slug: string;
  apiKey: string;
  posWebhookSecret: string | null;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div className="flex gap-2">
        <div
          className="min-w-0 flex-1 rounded-lg px-3 py-2 font-mono text-xs break-all"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 rounded-lg px-3 py-2"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
          title="Copy"
        >
          {copied ? <Check size={14} style={{ color: "var(--green)" }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.tenant) {
          setTenant(data.data.tenant);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const webhookUrl = origin ? `${origin}/api/webhooks/pos/sale` : "/api/webhooks/pos/sale";

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Venue credentials for POS integration
        </p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : !tenant ? (
        <p className="text-sm" style={{ color: "var(--red)" }}>
          Could not load venue settings.
        </p>
      ) : (
        <div className="max-w-xl space-y-4">
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div>
              <p className="text-sm font-medium">{tenant.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Slug: {tenant.slug}
              </p>
            </div>
            <CopyField label="Tenant API key (x-tenant-api-key)" value={tenant.apiKey} />
            {tenant.posWebhookSecret && (
              <CopyField label="Webhook HMAC secret" value={tenant.posWebhookSecret} />
            )}
          </div>

          <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm font-medium">POS webhook</p>
            <CopyField label="Endpoint" value={webhookUrl} />
            <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
              <p>Required headers:</p>
              <ul className="list-disc pl-4 space-y-0.5 font-mono">
                <li>x-tenant-api-key — your tenant API key above</li>
                <li>x-pos-signature — HMAC-SHA256 hex of the raw JSON body</li>
              </ul>
            </div>
          </div>

          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm font-medium mb-2">Platform environment</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Set <code className="rounded px-1" style={{ background: "var(--surface-elevated)" }}>SESSION_SECRET</code>,{" "}
              <code className="rounded px-1" style={{ background: "var(--surface-elevated)" }}>DATABASE_URL</code>, and
              <code className="rounded px-1" style={{ background: "var(--surface-elevated)" }}>GOOGLE_SHEETS_WEBHOOK_URL</code> in
              your host&apos;s environment (see{" "}
              <code className="rounded px-1" style={{ background: "var(--surface-elevated)" }}>.env.example</code>).
              New venues sign up at <code className="rounded px-1" style={{ background: "var(--surface-elevated)" }}>/signup</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
