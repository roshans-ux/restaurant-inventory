"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Package, Activity } from "lucide-react";
import Link from "next/link";
import { formatBottleStock } from "@/lib/format-bottles";

type Level = {
  productId: string;
  name: string;
  currentBottles: number;
  thresholdBottles: number | null;
  currentMl: number;
  bottleSizeMl: number;
};

type Alert = {
  id: string;
  message: string;
  type: string;
  createdAt: string;
  product: { name: string };
};

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-2 text-3xl font-semibold tabular-nums"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/inventory/levels").then((r) => r.json()),
      fetch("/api/alerts").then((r) => r.json()),
    ]).then(([lvl, alrt]) => {
      setLevels(lvl.levels ?? []);
      setAlerts(alrt.alerts ?? []);
      setLoading(false);
    });
  }, []);

   
  useEffect(() => {
    load();
  }, [load]);

  const belowThreshold = levels.filter(
    (l) => l.thresholdBottles !== null && l.currentBottles < l.thresholdBottles,
  );

  const totalFullBottles = levels.reduce(
    (s, l) => s + Math.floor(l.currentMl / l.bottleSizeMl),
    0,
  );
  const partialSkuCount = levels.filter(
    (l) => l.currentMl - Math.floor(l.currentMl / l.bottleSizeMl) * l.bottleSizeMl > 0,
  ).length;
  const totalBottlesLabel =
    partialSkuCount > 0
      ? `${totalFullBottles} full, ${partialSkuCount} SKU${partialSkuCount === 1 ? "" : "s"} with partial`
      : `${totalFullBottles} full`;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Live inventory status
        </p>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard label="Total SKUs" value={levels.length} />
            <StatCard
              label="Total Bottles"
              value={totalBottlesLabel}
              sub="across all SKUs"
            />
            <StatCard
              label="Below Threshold"
              value={belowThreshold.length}
              accent={belowThreshold.length > 0 ? "var(--red)" : "var(--green)"}
              sub={belowThreshold.length > 0 ? "needs restocking" : "all good"}
            />
          </div>

          {belowThreshold.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                <AlertTriangle size={14} style={{ color: "var(--red)" }} />
                Needs Restocking
              </h2>
              <div className="grid gap-2">
                {belowThreshold.map((l) => {
                  const fullInStock = Math.floor(l.currentMl / l.bottleSizeMl);
                  return (
                    <div
                      key={l.productId}
                      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3"
                      style={{ background: "var(--red-dim)", border: "1px solid rgba(224,92,92,0.25)" }}
                    >
                      <span className="font-medium">{l.name}</span>
                      <span className="text-right text-sm" style={{ color: "var(--red)" }}>
                        {fullInStock} {fullInStock === 1 ? "bottle" : "bottles"} in stock / {l.thresholdBottles}{" "}
                        minimum required {l.thresholdBottles === 1 ? "bottle" : "bottles"} in stock
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                <Package size={14} />
                All Stock Levels
              </h2>
              <Link href="/admin/products" className="text-xs" style={{ color: "var(--accent)" }}>
                Manage →
              </Link>
            </div>
            {levels.length === 0 ? (
              <div
                className="rounded-xl p-8 text-center text-sm"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                No bottles yet.{" "}
                <Link href="/admin/products" style={{ color: "var(--accent)" }}>
                  Add your first bottle →
                </Link>
              </div>
            ) : (
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid var(--border)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Bottle
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Stock
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Current (ml)
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Threshold
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map((l, i) => {
                      const low = l.thresholdBottles !== null && l.currentBottles < l.thresholdBottles;
                      return (
                        <tr
                          key={l.productId}
                          style={{
                            borderBottom: i < levels.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                            background: "var(--surface-elevated)",
                          }}
                        >
                          <td className="px-4 py-3 font-medium">{l.name}</td>
                          <td
                            className="px-4 py-3 text-right text-xs"
                            style={{ color: low ? "var(--red)" : "var(--text-primary)" }}
                          >
                            {formatBottleStock(l.currentMl, l.bottleSizeMl)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                            {l.currentMl}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {l.thresholdBottles ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{
                                background: low ? "var(--red-dim)" : "var(--green-dim)",
                                color: low ? "var(--red)" : "var(--green)",
                              }}
                            >
                              {low ? "Low" : "OK"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {alerts.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                  <Activity size={14} />
                  Active Alerts
                </h2>
                <Link href="/admin/alerts" className="text-xs" style={{ color: "var(--accent)" }}>
                  View all →
                </Link>
              </div>
              <div className="grid gap-2">
                {alerts.slice(0, 5).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg px-4 py-3"
                    style={{ background: "var(--accent-dim)", border: "1px solid rgba(245,166,35,0.2)" }}
                  >
                    <span className="text-sm">{a.message}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
