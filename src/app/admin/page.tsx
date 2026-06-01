"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Package } from "lucide-react";
import Link from "next/link";
import RecentSalesTable, { type RecentSaleRow } from "@/components/admin/RecentSalesTable";
import StockActivityTable, { type StockActivityRow } from "@/components/admin/StockActivityTable";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import TopSellingSkusChart from "@/components/admin/TopSellingSkusChart";
import { formatBottleStock } from "@/lib/format-bottles";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { shiftReportFilename } from "@/lib/shift-report-filename";
import { formatBottleSizeLabel } from "@/lib/product-naming";

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
  productId: string;
  product: { name: string };
};

type LevelsSortField = "name" | "stock" | "ml" | "threshold" | "status";
type SortDirection = "asc" | "desc";

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
  const [recentSales, setRecentSales] = useState<RecentSaleRow[]>([]);
  const [activity, setActivity] = useState<StockActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelsSortField, setLevelsSortField] = useState<LevelsSortField>("name");
  const [levelsSortDirection, setLevelsSortDirection] = useState<SortDirection>("asc");
  const [shiftBanner, setShiftBanner] = useState<string | null>(null);
  const [shiftReady, setShiftReady] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [confirmEarly, setConfirmEarly] = useState(false);

  const loadShiftStatus = useCallback(async () => {
    const res = await fetch("/api/shift-report/status");
    const data = await readJsonResponse<{
      ok?: boolean;
      data?: { banner?: string; readyAt?: string | null };
    }>(res);
    if (data.ok && data.data) {
      setShiftBanner(data.data.banner ?? null);
      setShiftReady(Boolean(data.data.readyAt) || Boolean(data.data.banner?.includes("ready")));
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [lvlRes, alrtRes, salesRes, actRes] = await Promise.all([
        fetch("/api/inventory/levels"),
        fetch("/api/alerts"),
        fetch("/api/pos-sim/sales?limit=5"),
        fetch("/api/inventory/activity"),
      ]);
      const [lvl, alrt, sales, act] = await Promise.all([
        readJsonResponse<{ levels?: Level[] }>(lvlRes),
        readJsonResponse<{ ok?: boolean; alerts?: Alert[] }>(alrtRes),
        readJsonResponse<{ ok?: boolean; data?: { sales?: RecentSaleRow[] } }>(salesRes),
        readJsonResponse<{ ok?: boolean; data?: { activity?: StockActivityRow[] } }>(actRes),
      ]);
      setLevels(lvl.levels ?? []);
      setAlerts(alrt.alerts ?? []);
      setRecentSales(sales.data?.sales ?? []);
      setActivity(act.data?.activity ?? []);
    } finally {
      setLoading(false);
    }
    loadShiftStatus();
  }, [loadShiftStatus]);

   
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
  const lowAlertByProductId = new Map(
    alerts.filter((a) => a.type === "LOW_STOCK").map((a) => [a.productId, a]),
  );
  const slippageAlerts = alerts.filter((a) => a.type === "SLIPPAGE");

  const sortedLevels = useMemo(() => {
    return [...levels].sort((a, b) => {
      const aLow =
        a.thresholdBottles !== null && a.currentBottles < a.thresholdBottles;
      const bLow =
        b.thresholdBottles !== null && b.currentBottles < b.thresholdBottles;
      let compare = 0;
      if (levelsSortField === "name") {
        compare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (levelsSortField === "stock") {
        const aFull = Math.floor(a.currentMl / a.bottleSizeMl);
        const bFull = Math.floor(b.currentMl / b.bottleSizeMl);
        compare = aFull - bFull;
      } else if (levelsSortField === "threshold") {
        const aThreshold = a.thresholdBottles ?? Number.MAX_SAFE_INTEGER;
        const bThreshold = b.thresholdBottles ?? Number.MAX_SAFE_INTEGER;
        compare = aThreshold - bThreshold;
      } else if (levelsSortField === "status") {
        compare = Number(aLow) - Number(bLow);
      } else {
        compare = a.currentMl - b.currentMl;
      }
      return levelsSortDirection === "asc" ? compare : -compare;
    });
  }, [levels, levelsSortDirection, levelsSortField]);

  function onLevelsSort(field: LevelsSortField) {
    if (levelsSortField === field) {
      setLevelsSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setLevelsSortField(field);
    setLevelsSortDirection("asc");
  }

  function levelsHeaderButton(
    field: LevelsSortField,
    label: string,
    align: "left" | "right" = "left",
  ) {
    return (
      <button
        type="button"
        onClick={() => onLevelsSort(field)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""}`}
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        <SortHeaderIcon active={levelsSortField === field} direction={levelsSortDirection} />
      </button>
    );
  }

  async function scheduleShiftReport() {
    setShiftLoading(true);
    setShiftError("");
    try {
      const res = await fetch("/api/shift-report/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "schedule" }),
      });
      const data = await readJsonResponse<{ ok?: boolean; error?: { message?: string } }>(res);
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Schedule failed"));
      }
      setShowShiftModal(false);
      await loadShiftStatus();
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setShiftLoading(false);
    }
  }

  async function generateNow() {
    setShiftLoading(true);
    setShiftError("");
    try {
      const res = await fetch("/api/shift-report/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "now", confirmEarly }),
      });
      if (res.status === 409) {
        setConfirmEarly(true);
        setShiftError("Shift has not ended. Check confirm to generate early.");
        return;
      }
      if (!res.ok) {
        const data = await readJsonResponse<{ ok?: boolean; error?: { message?: string } }>(res);
        throw new Error(getApiErrorMessage(data, "Generate failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = shiftReportFilename();
      a.click();
      URL.revokeObjectURL(url);
      setShowShiftModal(false);
      setConfirmEarly(false);
      await loadShiftStatus();
    } catch (err) {
      setShiftError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setShiftLoading(false);
    }
  }

  async function downloadShiftReport() {
    const res = await fetch("/api/shift-report/download");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = shiftReportFilename();
    a.click();
    URL.revokeObjectURL(url);
    await loadShiftStatus();
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Live inventory status
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShiftError("");
            setConfirmEarly(false);
            setShowShiftModal(true);
          }}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          <FileSpreadsheet size={15} />
          Generate Shift Report
        </button>
      </div>

      {shiftBanner && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--accent-dim)", border: "1px solid rgba(212,175,55,0.3)" }}
        >
          <p className="text-sm" style={{ color: "var(--accent)" }}>
            {shiftBanner}
          </p>
          {shiftReady && (
            <button
              type="button"
              onClick={downloadShiftReport}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              <Download size={13} />
              Download CSV
            </button>
          )}
        </div>
      )}

      {showShiftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-lg font-semibold">Shift Report</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Schedule for end of shift or generate now. Report includes opening, received, sold, adjusted, and closing ml per SKU.
            </p>
            {confirmEarly && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmEarly}
                  onChange={(e) => setConfirmEarly(e.target.checked)}
                />
                Confirm early generation (shift not ended)
              </label>
            )}
            {shiftError && (
              <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
                {shiftError}
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scheduleShiftReport}
                disabled={shiftLoading}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0e0e11" }}
              >
                Schedule at shift end
              </button>
              <button
                type="button"
                onClick={generateNow}
                disabled={shiftLoading}
                className="rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              >
                Generate now
              </button>
              <button
                type="button"
                onClick={() => setShowShiftModal(false)}
                className="rounded-lg px-4 py-2 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <TopSellingSkusChart />

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
                  const lowAlert = lowAlertByProductId.get(l.productId);
                  return (
                    <div
                      key={l.productId}
                      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3"
                      style={{ background: "var(--red-dim)", border: "1px solid rgba(224,92,92,0.25)" }}
                    >
                      <span className="font-medium">
                        {l.name} ({formatBottleSizeLabel(l.bottleSizeMl)})
                      </span>
                      <span className="text-right text-sm" style={{ color: "var(--red)" }}>
                        {fullInStock} {fullInStock === 1 ? "bottle" : "bottles"} in stock / {l.thresholdBottles}{" "}
                        minimum required {l.thresholdBottles === 1 ? "bottle" : "bottles"} in stock
                        {lowAlert && (
                          <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                            Low since {new Date(lowAlert.createdAt).toLocaleString()}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {slippageAlerts.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                <AlertTriangle size={14} style={{ color: "var(--red)" }} />
                Slippage Alerts
              </h2>
              <div className="grid gap-2">
                {slippageAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg px-4 py-3 text-sm"
                    style={{
                      background: "var(--red-dim)",
                      border: "1px solid rgba(224,92,92,0.25)",
                      color: "var(--red)",
                    }}
                  >
                    <span className="font-medium">{a.product.name}</span>
                    <span className="mx-2" style={{ color: "var(--text-muted)" }}>
                      ·
                    </span>
                    {a.message}
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
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
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                        {levelsHeaderButton("name", "Bottle")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("stock", "Stock", "right")}</span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("ml", "Current (ml)", "right")}</span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("threshold", "Threshold", "right")}</span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("status", "Status", "right")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLevels.map((l, i) => {
                      const low = l.thresholdBottles !== null && l.currentBottles < l.thresholdBottles;
                      return (
                        <tr
                          key={l.productId}
                          style={{
                            borderBottom: i < sortedLevels.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                            background: "var(--surface-elevated)",
                          }}
                        >
                          <td className="px-4 py-3 font-medium">
                            {l.name} ({formatBottleSizeLabel(l.bottleSizeMl)})
                          </td>
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

          <section className="grid gap-4 lg:grid-cols-2">
            <RecentSalesTable
              sales={recentSales}
              limit={5}
              sortable
              viewAllHref="/admin/pos-sim"
              viewAllLabel="View all orders"
            />
            <StockActivityTable
              activity={activity}
              variant="preview"
              limit={5}
              viewAllHref="/admin/stock"
              viewAllLabel="View all activity"
            />
          </section>

        </>
      )}
    </div>
  );
}
