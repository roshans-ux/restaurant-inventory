"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "@/lib/http";
import {
  SALES_PERIOD_OPTIONS,
  type SalesPeriod,
} from "@/lib/sales-period";

type SkuRow = {
  productId: string;
  name: string;
  totalMlSold: number;
  bottleSizeMl: number;
  totalBottlesSold: number;
};

function formatBottleCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function rankStyle(rank: number): {
  circleBg: string;
  circleColor: string;
  bar: string;
  valueColor: string;
} {
  if (rank === 1) {
    return {
      circleBg: "#f5a623",
      circleColor: "#0e0e11",
      bar: "linear-gradient(90deg, #f5a623 0%, #ffcc70 100%)",
      valueColor: "#f5a623",
    };
  }
  if (rank === 2) {
    return {
      circleBg: "#C0C0C0",
      circleColor: "#0e0e11",
      bar: "linear-gradient(90deg, #9a9a9a 0%, #d4d4d4 100%)",
      valueColor: "var(--text-muted)",
    };
  }
  if (rank === 3) {
    return {
      circleBg: "#CD7F32",
      circleColor: "#0e0e11",
      bar: "linear-gradient(90deg, #8a6a4a 0%, #c4a07a 100%)",
      valueColor: "var(--text-muted)",
    };
  }
  return {
    circleBg: "#444",
    circleColor: "#fff",
    bar: "#444",
    valueColor: "var(--text-muted)",
  };
}

export default function TopSellingSkusChart() {
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPeriod: SalesPeriod) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/top-selling-skus?period=${nextPeriod}`);
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setSkus([]);
        setError(getApiErrorMessage(data, "Failed to load sales chart"));
        return;
      }
      setSkus(data.data?.skus ?? []);
    } catch {
      setSkus([]);
      setError("Failed to load sales chart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const maxBottles = useMemo(
    () =>
      skus.length > 0
        ? Math.max(...skus.map((s) => Number(s.totalBottlesSold) || 0))
        : 0,
    [skus],
  );

  const periodLabel =
    SALES_PERIOD_OPTIONS.find((opt) => opt.value === period)?.label ?? "This month";

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Top Selling SKUs by Volume
          </h2>
          <div className="flex flex-wrap gap-2">
            {SALES_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{
                  background: period === opt.value ? "var(--accent-dim)" : "transparent",
                  color: period === opt.value ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${period === opt.value ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="flex-1 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Loading chart…
          </p>
        ) : error ? (
          <p className="flex-1 py-6 text-sm" style={{ color: "var(--red)" }}>
            {error}
          </p>
        ) : skus.length === 0 ? (
          <p className="flex-1 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No sales data for this period
          </p>
        ) : (
          <div
            className="flex min-h-0 flex-1 flex-col"
            role="list"
            aria-label="Top selling SKUs by bottles sold"
          >
            <div className="flex flex-col" style={{ gap: 10 }}>
              {skus.map((sku, i) => {
                const rank = i + 1;
                const style = rankStyle(rank);
                const bottles = Number(sku.totalBottlesSold) || 0;
                const barWidthPct = maxBottles > 0 ? (bottles / maxBottles) * 100 : 0;
                return (
                  <div
                    key={sku.productId}
                    role="listitem"
                    className="flex items-center gap-3"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                      style={{ background: style.circleBg, color: style.circleColor }}
                    >
                      {rank}
                    </span>
                    <span
                      className="w-28 shrink-0 truncate text-sm"
                      style={{ color: "var(--text-primary)" }}
                      title={sku.name}
                    >
                      {sku.name}
                    </span>
                    <div
                      className="relative min-w-0 flex-1 overflow-hidden rounded-full"
                      style={{ height: 6, background: "var(--surface-elevated)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${barWidthPct}%`,
                          background: style.bar,
                        }}
                      />
                    </div>
                    <span
                      className="w-10 shrink-0 text-right text-sm tabular-nums"
                      style={{ color: style.valueColor }}
                    >
                      {formatBottleCount(bottles)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          className="mt-4 flex items-center justify-between pt-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <p
            className="text-[10px] font-medium uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            BOTTLES SOLD
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {periodLabel}
          </p>
        </div>
      </div>
    </section>
  );
}
