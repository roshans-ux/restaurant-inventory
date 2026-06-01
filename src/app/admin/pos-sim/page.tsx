"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Zap, Plus, Trash2, Send, Martini } from "lucide-react";
import RecentSalesTable, { type RecentSaleRow } from "@/components/admin/RecentSalesTable";
import { formatSaleSize } from "@/lib/pos-sales-format";
import { isPosItemConfigured } from "@/lib/pos-mapping-utils";
import { getApiErrorMessage } from "@/lib/http";

type Mapping = {
  id: string;
  posItemId: string | null;
  pourMl: string;
  product: { name: string; bottleSizeMl: string };
};

type CocktailMapping = {
  id: string;
  name: string;
  posItemId: string;
  recipe: string;
  ingredients: { productId: string; quantityMl: number }[];
};

type SaleLine = {
  posItemId: string;
  productName: string;
  pourMl: number;
  bottleSizeMl: number;
  quantity: number;
  recipe?: string;
  isCocktail?: boolean;
};

function cocktailPourMlPerUnit(mapping: CocktailMapping): number {
  return mapping.ingredients.reduce((sum, ing) => sum + ing.quantityMl, 0);
}

type SaleHistoryItem = RecentSaleRow;
type SaleItemTab = "pours" | "cocktails";

type SaleRejectedLine = {
  externalLineId: string;
  posItemId: string;
  reason: string;
  productName?: string;
  cocktailName?: string;
  requestedQuantity?: number;
  maxAllowedQuantity?: number;
  pourMl?: number;
  bottleSizeMl?: number;
  availableMl?: number;
  requiredMl?: number;
};

type ApiErrorObject = {
  code?: string;
  message?: string;
  details?: SaleRejectedLine[];
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PosSimPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [cocktailMappings, setCocktailMappings] = useState<CocktailMapping[]>([]);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [secret, setSecret] = useState("dev-secret");
  const [tenantApiKey, setTenantApiKey] = useState("");
  const [firing, setFiring] = useState(false);
  const [result, setResult] = useState<
    { ok?: boolean; error?: string | ApiErrorObject; idempotent?: boolean } | null
  >(null);
  const [lastPayload, setLastPayload] = useState<string>("");
  const [saleHistory, setSaleHistory] = useState<SaleHistoryItem[]>([]);
  const [salesPage, setSalesPage] = useState(1);
  const [salesTotal, setSalesTotal] = useState(0);
  const SALES_PAGE_SIZE = 10;
  const [search, setSearch] = useState("");
  const [saleItemTab, setSaleItemTab] = useState<SaleItemTab>("pours");
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsLoadError, setItemsLoadError] = useState("");

  const load = useCallback(async () => {
    setItemsLoading(true);
    setItemsLoadError("");
    const errors: string[] = [];
    try {
      const [pourRes, cocktailRes] = await Promise.all([
        fetch("/api/pos-mappings"),
        fetch("/api/cocktail-mappings"),
      ]);
      const [pourData, cocktailData] = await Promise.all([
        pourRes.json(),
        cocktailRes.json(),
      ]);

      if (!pourRes.ok || pourData.ok === false) {
        errors.push(getApiErrorMessage(pourData, "Failed to load pour mappings"));
        setMappings([]);
      } else {
        setMappings(pourData.mappings ?? []);
      }

      if (!cocktailRes.ok || cocktailData.ok === false) {
        errors.push(getApiErrorMessage(cocktailData, "Failed to load cocktail mappings"));
        setCocktailMappings([]);
      } else {
        setCocktailMappings(
          cocktailData.mappings ?? cocktailData.data?.mappings ?? [],
        );
      }

      if (errors.length > 0) {
        setItemsLoadError(errors.join(" · "));
      }
    } catch {
      setItemsLoadError("Failed to load sale items");
      setMappings([]);
      setCocktailMappings([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const loadRecentSales = useCallback(async (page = 1) => {
    const res = await fetch(
      `/api/pos-sim/sales?page=${page}&limit=${SALES_PAGE_SIZE}`,
      { cache: "no-store" },
    );
    const data = await res.json();
    if (!res.ok || data.ok === false) return;
    setSaleHistory(data.data?.sales ?? []);
    setSalesTotal(data.data?.total ?? 0);
    setSalesPage(data.data?.page ?? page);
  }, []);

  useEffect(() => {
    let active = true;
    void load();
    void loadRecentSales();
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.ok && data.data?.tenant) {
          setTenantApiKey(data.data.tenant.apiKey ?? "");
          if (data.data.tenant.posWebhookSecret) {
            setSecret(data.data.tenant.posWebhookSecret);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) void loadRecentSales();
      });
    return () => {
      active = false;
    };
  }, [load, loadRecentSales]);

  const configuredMappings = useMemo(
    () => mappings.filter((m) => isPosItemConfigured(m.posItemId)),
    [mappings],
  );

  const filteredMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return configuredMappings;
    return configuredMappings.filter(
      (m) =>
        m.product.name.toLowerCase().includes(query) ||
        (m.posItemId ?? "").toLowerCase().includes(query),
    );
  }, [configuredMappings, search]);

  const filteredCocktailMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return cocktailMappings;
    return cocktailMappings.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.posItemId.toLowerCase().includes(query) ||
        m.recipe.toLowerCase().includes(query),
    );
  }, [cocktailMappings, search]);

  const hasSaleItems = configuredMappings.length > 0 || cocktailMappings.length > 0;

  function addPourLine(posItemId: string) {
    const m = configuredMappings.find((x) => x.posItemId === posItemId);
    if (!m?.posItemId) return;
    const mappedPosItemId = m.posItemId;
    const pourMl = Number(m.pourMl);
    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (line) =>
          !line.isCocktail && line.posItemId === mappedPosItemId && line.pourMl === pourMl,
      );
      if (existingIdx === -1) {
        return [
          ...prev,
          {
            posItemId: mappedPosItemId,
            productName: m.product.name,
            pourMl,
            bottleSizeMl: Number(m.product.bottleSizeMl),
            quantity: 1,
          },
        ];
      }

      return prev.map((line, idx) =>
        idx === existingIdx ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
  }

  function addCocktailLine(posItemId: string) {
    const m = cocktailMappings.find((x) => x.posItemId === posItemId);
    if (!m) return;
    const pourMl = cocktailPourMlPerUnit(m);
    setLines((prev) => {
      const existingIdx = prev.findIndex(
        (line) => line.isCocktail && line.posItemId === m.posItemId,
      );
      if (existingIdx === -1) {
        return [
          ...prev,
          {
            posItemId: m.posItemId,
            productName: m.name,
            pourMl,
            bottleSizeMl: 0,
            quantity: 1,
            recipe: m.recipe,
            isCocktail: true,
          },
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
    if (!tenantApiKey.trim()) {
      setResult({
        ok: false,
        error: {
          message:
            "Tenant API key is required — sign in so the simulator can send x-tenant-api-key.",
        },
      });
      return;
    }
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

    let data: {
      ok?: boolean;
      data?: { idempotent?: boolean };
      error?: { code?: string; message?: string; details?: SaleRejectedLine[] };
    } = {};
    try {
      data = await res.json();
    } catch {
      setFiring(false);
      setResult({
        ok: false,
        error: { message: `Webhook returned ${res.status} with an invalid response — try again.` },
      });
      return;
    }
    setFiring(false);

    if (res.ok && data.ok) {
      setResult({
        ok: true,
        idempotent: Boolean(data.data?.idempotent),
      });
      await loadRecentSales();
      setLines([]);
      return;
    }

    const code = data.error?.code as string | undefined;
    let hint = data.error?.message ?? "Webhook failed";
    if (res.status === 401) {
      if (code === "UNKNOWN_TENANT") {
        hint =
          "Invalid or missing tenant API key — sign in again or check venue settings.";
      } else if (code === "INVALID_WEBHOOK_SIGNATURE") {
        hint = "HMAC signature mismatch — confirm the secret matches your venue settings.";
      }
    } else if (res.status === 409 && code === "SALE_REJECTED_OUT_OF_STOCK") {
      hint =
        "Not enough stock for this entire ticket — reduce quantities or remove lines (e.g. multiple full-bottle pours add up quickly). Details below.";
    } else if (res.status === 409 && code === "DUPLICATE_SALE_LINES") {
      hint = "Duplicate sale lines — this simulator sale was already processed.";
    } else if (res.status === 409) {
      hint = data.error?.message ?? "Sale was rejected.";
    } else if (res.status === 500 && code === "POS_SALE_PROCESSING_FAILED") {
      hint = "Sale processing failed — try again. If the ticket is large, check stock levels first.";
    }

    setResult({
      ok: false,
      error: {
        ...data.error,
        code,
        message: hint,
        details: data.error?.details,
      },
    });
  }

  const totalMl = lines.reduce((s, l) => s + l.pourMl * l.quantity, 0);
  const rejectedLines: SaleRejectedLine[] =
    result && !result.ok && typeof result.error !== "string" && Array.isArray(result.error?.details)
      ? (result.error.details as SaleRejectedLine[])
      : [];

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

      <div className="grid gap-8 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-0 flex-col gap-4">
          <div
            className="flex min-h-0 flex-1 flex-col rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="mb-3 shrink-0 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Add Items to Sale
            </h2>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by bottle, cocktail, or POS item ID"
              className="mb-3 w-full shrink-0 rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />

            {itemsLoading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Loading sale items…
              </p>
            ) : itemsLoadError ? (
              <p className="text-sm" style={{ color: "var(--red)" }}>
                {itemsLoadError}
              </p>
            ) : !hasSaleItems ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No configured POS mappings yet — set straight pours or cocktails on the Mappings page
                first
              </p>
            ) : filteredMappings.length === 0 && filteredCocktailMappings.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No mapped items match your search
              </p>
            ) : (
              <>
                <div className="mb-3 flex shrink-0 gap-2">
                  {(
                    [
                      { value: "pours" as const, label: "Straight Pours" },
                      { value: "cocktails" as const, label: "Cocktails" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setSaleItemTab(tab.value)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{
                        background: saleItemTab === tab.value ? "var(--accent-dim)" : "transparent",
                        color: saleItemTab === tab.value ? "var(--accent)" : "var(--text-secondary)",
                        border: `1px solid ${saleItemTab === tab.value ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col content-start gap-2 overflow-y-auto pr-1">
                  {search.trim() &&
                  ((saleItemTab === "pours" &&
                    filteredMappings.length === 0 &&
                    filteredCocktailMappings.length > 0) ||
                    (saleItemTab === "cocktails" &&
                      filteredCocktailMappings.length === 0 &&
                      filteredMappings.length > 0)) ? (
                    <p className="py-6 text-sm" style={{ color: "var(--text-muted)" }}>
                      Switch to other tabs to see more results.
                    </p>
                  ) : saleItemTab === "pours" ? (
                    filteredMappings.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => m.posItemId && addPourLine(m.posItemId)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all"
                          style={{
                            background: "var(--surface-elevated)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <span className="min-w-0 truncate font-medium">{m.product.name}</span>
                          <span
                            className="ml-auto flex shrink-0 items-center gap-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <span className="font-mono text-xs">{m.posItemId}</span>
                            <span
                              className="rounded-full px-2 py-0.5 text-xs whitespace-nowrap"
                              style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                            >
                              {formatSaleSize(Number(m.pourMl), Number(m.product.bottleSizeMl))}
                            </span>
                            <Plus size={14} className="shrink-0" style={{ color: "var(--accent)" }} />
                          </span>
                        </button>
                      ))
                  ) : (
                    filteredCocktailMappings.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => addCocktailLine(m.posItemId)}
                          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-all"
                          style={{
                            background: "var(--surface-elevated)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <span className="flex min-w-[8rem] shrink-0 items-center gap-2 sm:min-w-[10rem]">
                            <Martini size={14} className="shrink-0" style={{ color: "var(--accent)" }} />
                            <span className="truncate font-medium">{m.name}</span>
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-xs"
                            style={{ color: "var(--text-muted)" }}
                            title={m.posItemId}
                          >
                            {m.posItemId}
                          </span>
                          <span
                            className="hidden min-w-0 max-w-[40%] shrink truncate rounded-full px-2 py-0.5 text-xs sm:inline"
                            style={{ background: "var(--accent-dim)", color: "var(--accent)" }}
                            title={m.recipe}
                          >
                            {m.recipe}
                          </span>
                          <Plus size={14} className="shrink-0" style={{ color: "var(--accent)" }} />
                        </button>
                      ))
                  )}
                </div>
              </>
            )}
          </div>

          {!tenantApiKey && (
            <div
              className="shrink-0 rounded-xl px-4 py-3 text-sm"
              style={{
                background: "var(--amber-dim, rgba(251,191,36,0.12))",
                border: "1px solid rgba(251,191,36,0.35)",
                color: "var(--amber, #fbbf24)",
              }}
            >
              Tenant API key not loaded — sign in so webhook requests include{" "}
              <code className="font-mono text-xs">x-tenant-api-key</code>.
            </div>
          )}

          <div
            className="shrink-0 rounded-xl p-5"
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

        <div className="flex min-h-0 flex-col gap-4">
          <div
            className="shrink-0 rounded-xl p-5"
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
                        {l.isCocktail
                          ? `${l.recipe ?? "Recipe"} × ${l.quantity} = ${l.pourMl * l.quantity}ml`
                          : `${formatSaleSize(l.pourMl, l.bottleSizeMl)} × ${l.quantity} = ${l.pourMl * l.quantity}ml`}
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
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            <Send size={15} />
            {firing ? "Firing…" : "Fire Sale Webhook"}
          </button>

          {result && (
            <div
              className="shrink-0 rounded-xl p-4 text-sm"
              style={{
                background: result.ok ? "var(--green-dim)" : "var(--red-dim)",
                border: `1px solid ${result.ok ? "rgba(74,222,128,0.3)" : "rgba(224,92,92,0.3)"}`,
                color: result.ok ? "var(--green)" : "var(--red)",
              }}
            >
              {result.ok ? (
                result.idempotent ? (
                  "⚡ Sale already processed (idempotent)"
                ) : (
                  "✓ Sale recorded — inventory updated"
                )
              ) : (
                <>
                  <p>
                    ✗ {getApiErrorMessage(
                      typeof result.error === "object" && result.error
                        ? { error: result.error }
                        : {},
                      typeof result.error === "string"
                        ? result.error
                        : "Webhook failed",
                    )}
                  </p>
                  {rejectedLines.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-xs">
                      {rejectedLines.map((line) => {
                        const itemLabel =
                          line.cocktailName ?? line.productName ?? line.posItemId;
                        const saleSize = line.pourMl
                          ? formatSaleSize(line.pourMl, line.bottleSizeMl)
                          : "sale size";
                        if (line.reason === "OUT_OF_STOCK_MARGIN_GUARD") {
                          return (
                            <li key={line.externalLineId}>
                              {itemLabel} ({saleSize}): requested {line.requestedQuantity ?? 0}, max allowed{" "}
                              {line.maxAllowedQuantity ?? 0}
                            </li>
                          );
                        }
                        const reasonLabel =
                          line.reason === "MAPPING_NOT_FOUND"
                            ? "no POS mapping"
                            : line.reason === "COCKTAIL_INGREDIENT_UNAVAILABLE"
                              ? "cocktail ingredient unavailable"
                              : line.reason;
                        return (
                          <li key={line.externalLineId}>
                            {itemLabel}: {reasonLabel}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {lastPayload && (
            <details className="shrink-0 text-xs">
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

          <RecentSalesTable
            fillHeight
            sales={saleHistory}
            title="Recent Sales"
            pagination={{
              page: salesPage,
              pageSize: SALES_PAGE_SIZE,
              totalCount: salesTotal,
              onPageChange: (page) => void loadRecentSales(page),
            }}
          />
        </div>
      </div>
    </div>
  );
}
