"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";

type Alert = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  product: { id: string; name: string };
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/alerts");
    const data = await res.json();
    setAlerts(data.alerts ?? []);
    setLoading(false);
  }, []);

   
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Low-stock notifications that clear automatically after stock is replenished
        </p>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : alerts.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-20"
          style={{ border: "2px dashed var(--border)", color: "var(--text-muted)" }}
        >
          <Bell size={32} strokeWidth={1} className="mb-3" />
          <p className="text-sm">No active alerts — all stock levels OK</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-xl px-5 py-4"
              style={{ background: "var(--accent-dim)", border: "1px solid rgba(245,166,35,0.25)" }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                    style={{ background: "rgba(245,166,35,0.2)", color: "var(--accent)" }}
                  >
                    {a.type.replace("_", " ")}
                  </span>
                  <span className="font-medium">{a.product.name}</span>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {a.message}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
