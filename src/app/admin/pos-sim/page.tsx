"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Zap, Plus, Trash2, Send } from "lucide-react";

type Mapping = {
  id: string;
  posItemId: string;
  pourMl: string;
  product: { name: string };
};

type SaleLine = {
  posItemId: string;
  productName: string;
  pourMl: number;
  quantity: number;
};

type SaleHistoryItem = {
  id: string;
  saleId: string;
  soldAt: string;
  totalMl: number;
  lines: Array<{
    productName: string;
    quantity: number;
    pourMl: number;
  }>;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PosSimPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [secret, setSecret] = useState("dev-secret");
  const [tenantApiKey, setTenantApiKey] = useState("");
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState<
    { ok?: boolean; error?: string | { message?: string }; idempotent?: boolean } | null
  >(null);
  const [lastPayload, setLastPayload] = useState<string>("");
  const [saleHistory, setSaleHistory] = useState<SaleHistoryItem[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/pos-mappings");
    const data = await res.json();
    setMappings(data.mappings ?? []);
  }, []);

  const loadRecentSales = useCallback(async () => {
    const res = await fetch("/api/pos-sim/sales");
    const data = await res.json();
    setSaleHistory(data.data?.sales ?? []);
  }, []);

  useEffect(() => {
    Promise.all([load(), loadRecentSales()]);
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.data?.tenant) {
          setTenantApiKey(data.data.tenant.apiKey ?? "");
          if (data.data.tenant.posWebhookSecret) {
            setSecret(data.data.tenant.posWebhookSecret);
          }
        }
      })
      .catch(() => {});
  }, [load, loadRecentSales]);

  const filteredMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return mappings;
    return mappings.filter(
      (m) =>
        m.product.name.toLowerCase().includes(query) ||
        m.posItemId.toLowerCase().includes(query),
    );
  }, [mappings, search]);

  function addLine(posItemId: string) {
    const m = mappings.find((x) => x.posItemId === posItemId);
    if (!m) return;
    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (line) => line.posItemId === m.posItemId && line.pourMl === Number(m.pourMl),
      );
      if (existingIdx === -1) {
        return [
          ...prev,
          { posItemId: m.posItemId, productName: m.product.name, pourMl: Number(m.pourMl), quantity: 1 },
        ];
      }

      return prev.map((line, idx) =>
        idx === existingIdx ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  }

  function updateQty(idx: number, qty: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, qty) } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function fireSale() {
    if (lines.length === 0) return;
    setFiring(true);
    setResult(null);

    const payload = {
      external_sale_id: `sim_${uid()}`,
      sold_at: new Date().toISOString(),
      lines: lines.map((l, i) => ({
        external_line_id: `line_${uid()}_${i}`,
        pos_item_id: l.posItemId,
        quantity: l.quantity,
      })),
    };

    const body = JSON.stringify(payload);
    setLastPayload(JSON.stringify(payload, null, 2));

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(body);

    let signature = "";
    try {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
      signature = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      signature = "";
    }

    const res = await fetch("/api/webhooks/pos/sale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pos-signature": signature,
        "x-tenant-api-key": tenantApiKey,
      },
      body,
    });

    const data = await res.json();
    setResult(data);
    setFiring(false);

    if (data.ok) {
      await loadRecentSales();
      setLines([]);
    }
  }

  const totalMl = lines.reduce((s, l) => s + l.pourMl * l.quantity, 0);
  const formatSaleSize = (ml: number) => (ml === 750 ? "1 bottle" : `${ml}ml`);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Zap size={20} style={{ color: "var(--accent)" }} />
          POS Simulator
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Fire a signed sale webhook to test inventory depletion in ml
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Add Items to Sale
            </h2>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by bottle or POS item ID"
              className="mb-3 w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />

            {mappings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No POS mappings yet — add some on the Mappings page first
              </p>
            ) : filteredMappings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No mapped items match your search
              </p>
            ) : (
              <div className="grid gap-2">
                {filteredMappings.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addLine(m.posItemId)}
                    className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm transition-all"
                    style={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <span className="font-medium">{m.product.name}</span>
                    <span className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                      <span className="font-mono text-xs">{m.posItemId}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                      >
                        {formatSaleSize(Number(m.pourMl))}
                      </span>
                      <Plus size={14} style={{ color: "var(--accent)" }} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className="rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="mb-1 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              HMAC Secret
            </h2>
            <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
              Loaded from your venue settings. Used with x-tenant-api-key for webhook auth.
            </p>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full rounded-lg px-3 py-2 font-mono text-sm outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div
            className="min-h-40 rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Sale Ticket
              </h2>
              {lines.length > 0 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Total: {totalMl}ml deducted
                </span>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Add items from the left panel
              </p>
            ) : (
              <div className="grid gap-2">
                {lines.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <span className="text-sm font-medium">{l.productName}</span>
                      <span className="ml-2 text-xs" style={{ color: "var(--accent)" }}>
                        {formatSaleSize(l.pourMl)} × {l.quantity} = {l.pourMl * l.quantity}ml
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateQty(i, Number(e.target.value))}
                        className="w-14 rounded px-2 py-1 text-center text-sm outline-none"
                        style={{
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <button onClick={() => removeLine(i)}>
                        <Trash2 size={14} style={{ color: "var(--red)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={fireSale}
            disabled={firing || lines.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            <Send size={15} />
            {firing ? "Firing…" : "Fire Sale Webhook"}
          </button>

          {result && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{
                background: result.ok ? "var(--green-dim)" : "var(--red-dim)",
                border: `1px solid ${result.ok ? "rgba(74,222,128,0.3)" : "rgba(224,92,92,0.3)"}`,
                color: result.ok ? "var(--green)" : "var(--red)",
              }}
            >
              {result.ok
                ? result.idempotent
                  ? "⚡ Sale already processed (idempotent)"
                  : `✓ Sale recorded — inventory updated`
                : `✗ ${typeof result.error === "string" ? result.error : result.error?.message ?? "Webhook failed"}`}
            </div>
          )}

          {lastPayload && (
            <details className="text-xs">
              <summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>
                View last payload
              </summary>
              <pre
                className="mt-2 overflow-x-auto rounded-lg p-3"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
              >
                {lastPayload}
              </pre>
            </details>
          )}

          {saleHistory.length > 0 && (
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <h3 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Recent Sales
              </h3>
              <div className="grid gap-2">
                {saleHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg px-3 py-2"
                    style={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {item.saleId}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(item.soldAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {item.lines
                        .map((l) => `${l.productName} (${l.quantity} × ${formatSaleSize(l.pourMl)})`)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
                      Deducted: {item.totalMl}ml
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
