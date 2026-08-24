"use client";

import { FormEvent, useEffect, useState } from "react";
import { Copy, Check, Plus, Trash2, Pencil } from "lucide-react";
import {
  DAY_KEYS,
  formatDayLabel,
  getPreviousDayShiftEnd,
  type DayKey,
  type DayShift,
} from "@/lib/shift-schedule";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";

type TenantInfo = {
  name: string;
  slug: string;
  apiKey: string;
  posWebhookSecret: string | null;
  adminWhatsappNumber: string | null;
  whatsappConnected?: boolean;
  slippageTolerancePercent: number;
  shiftSchedule: Record<DayKey, DayShift | null>;
};

type Vendor = {
  id: string;
  name: string;
  whatsappNumber: string;
  products?: { id: string; name: string; sku: string | null }[];
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [slippage, setSlippage] = useState("10");
  const [schedule, setSchedule] = useState<Record<DayKey, DayShift | null>>({} as Record<DayKey, DayShift | null>);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [adminWhatsappError, setAdminWhatsappError] = useState("");
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorError, setVendorError] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editVendorName, setEditVendorName] = useState("");
  const [editVendorPhone, setEditVendorPhone] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  async function loadAll() {
    const [meRes, vendorsRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/vendors"),
    ]);
    const meData = await readJsonResponse<{
      ok?: boolean;
      data?: TenantInfo;
    }>(meRes);
    const vendorsData = await readJsonResponse<{
      ok?: boolean;
      data?: { vendors?: Vendor[] };
    }>(vendorsRes);
    if (meData.ok && meData.data) {
      const t = meData.data;
      setTenant({
        name: t.name,
        slug: t.slug,
        apiKey: t.apiKey,
        posWebhookSecret: t.posWebhookSecret,
        adminWhatsappNumber: t.adminWhatsappNumber ?? null,
        slippageTolerancePercent: t.slippageTolerancePercent ?? 10,
        shiftSchedule: t.shiftSchedule ?? {},
      });
      setAdminWhatsapp(t.adminWhatsappNumber ?? "");
      setWhatsappConnected(Boolean(t.whatsappConnected));
      setSlippage(String(t.slippageTolerancePercent ?? 10));
      setSchedule(t.shiftSchedule ?? {});
    }
    if (vendorsData.ok) {
      setVendors(vendorsData.data?.vendors ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    loadAll();
  }, []);

  function copyDayToAll(sourceKey: DayKey) {
    setSchedule((prev) => {
      const source = prev[sourceKey];
      if (!source?.start && !source?.end) return prev;
      const next = { ...prev };
      for (const key of DAY_KEYS) {
        if (key === sourceKey) continue;
        next[key] = { start: source.start ?? null, end: source.end ?? null };
      }
      return next;
    });
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");
    const previousTenant = tenant;
    const previousSlippage = slippage;
    const previousSchedule = schedule;
    const previousAdminWhatsapp = adminWhatsapp;
    setAdminWhatsappError("");
    const normalizedAdmin = adminWhatsapp.trim()
      ? normalizeIndianPhone(adminWhatsapp)
      : null;
    if (adminWhatsapp.trim() && !normalizedAdmin) {
      setAdminWhatsappError(INDIAN_PHONE_ERROR);
      setSavingSettings(false);
      return;
    }
    const nextSlippage = Math.round(Number(slippage));
    const nextSchedule = schedule;
    if (tenant) {
      setTenant({
        ...tenant,
        slippageTolerancePercent: nextSlippage,
        shiftSchedule: nextSchedule,
        adminWhatsappNumber: normalizedAdmin,
      });
    }
    setSettingsMsg("Saved");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slippageTolerancePercent: nextSlippage,
          shiftSchedule: nextSchedule,
          adminWhatsappNumber: normalizedAdmin,
        }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: {
          slippageTolerancePercent?: number;
          shiftSchedule?: Record<DayKey, DayShift | null>;
          adminWhatsappNumber?: string | null;
        };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Save failed"));
      if (tenant && data.data) {
        setTenant({
          ...tenant,
          slippageTolerancePercent: data.data.slippageTolerancePercent ?? nextSlippage,
          shiftSchedule: data.data.shiftSchedule ?? nextSchedule,
          adminWhatsappNumber:
            data.data.adminWhatsappNumber !== undefined
              ? data.data.adminWhatsappNumber
              : normalizedAdmin,
        });
        if (data.data.adminWhatsappNumber !== undefined) {
          setAdminWhatsapp(data.data.adminWhatsappNumber ?? "");
        }
      }
      setSettingsMsg("Saved");
    } catch (err) {
      setTenant(previousTenant);
      setSlippage(previousSlippage);
      setSchedule(previousSchedule);
      setAdminWhatsapp(previousAdminWhatsapp);
      setSettingsMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
    }
  }

  async function addVendor(e: FormEvent) {
    e.preventDefault();
    setAddingVendor(true);
    setVendorError("");
    const whatsappNumber = normalizeIndianPhone(vendorPhone);
    if (!whatsappNumber) {
      setVendorError(INDIAN_PHONE_ERROR);
      setAddingVendor(false);
      return;
    }
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vendorName, whatsappNumber }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { vendor?: Vendor };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Failed to add vendor"));
      const vendor = data.data?.vendor;
      if (vendor) {
        setVendors((prev) =>
          [...prev, { ...vendor, products: vendor.products ?? [] }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
      }
      setVendorName("");
      setVendorPhone("");
    } catch (err) {
      setVendorError(err instanceof Error ? err.message : "Failed to add vendor");
    } finally {
      setAddingVendor(false);
    }
  }

  async function deleteVendor(id: string) {
    setVendorError("");
    const previous = vendors;
    setVendors((prev) => prev.filter((v) => v.id !== id));
    if (editingVendorId === id) {
      cancelEditVendor();
    }
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await readJsonResponse<{ error?: { message?: string } }>(res);
        throw new Error(getApiErrorMessage(data, "Failed to delete vendor"));
      }
    } catch (err) {
      setVendors(previous);
      setVendorError(err instanceof Error ? err.message : "Failed to delete vendor");
    }
  }

  function startEditVendor(v: Vendor) {
    setEditingVendorId(v.id);
    setEditVendorName(v.name);
    setEditVendorPhone(v.whatsappNumber);
    setVendorError("");
  }

  function cancelEditVendor() {
    setEditingVendorId(null);
    setEditVendorName("");
    setEditVendorPhone("");
    setVendorError("");
  }

  async function saveVendorEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingVendorId) return;
    setSavingVendor(true);
    setVendorError("");
    const whatsappNumber = normalizeIndianPhone(editVendorPhone);
    if (!whatsappNumber) {
      setVendorError(INDIAN_PHONE_ERROR);
      setSavingVendor(false);
      return;
    }
    try {
      const res = await fetch(`/api/vendors/${editingVendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editVendorName, whatsappNumber }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { vendor?: Vendor };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Failed to update vendor"));
      const vendor = data.data?.vendor;
      if (vendor) {
        setVendors((prev) =>
          prev
            .map((v) =>
              v.id === editingVendorId
                ? { ...v, name: vendor.name, whatsappNumber: vendor.whatsappNumber }
                : v,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      cancelEditVendor();
    } catch (err) {
      setVendorError(err instanceof Error ? err.message : "Failed to update vendor");
    } finally {
      setSavingVendor(false);
    }
  }

  const webhookUrl = origin ? `${origin}/api/webhooks/pos/sale` : "/api/webhooks/pos/sale";

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Venue credentials, slippage tolerance, shift schedule, and vendors
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
              <p className="text-sm font-medium">POS connection</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {tenant.name} · {tenant.slug}
              </p>
            </div>
            <CopyField label="Webhook endpoint" value={webhookUrl} />
            <CopyField label="Tenant API Key" value={tenant.apiKey ?? ""} />
            <CopyField label="POS Webhook Secret" value={tenant.posWebhookSecret ?? ""} />
            <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
              <p>Required headers on every sale webhook:</p>
              <ul className="list-disc pl-4 space-y-0.5 font-mono">
                <li>x-tenant-api-key — Tenant API Key</li>
                <li>x-pos-signature — HMAC-SHA256 hex of the raw JSON body (use POS Webhook Secret)</li>
              </ul>
            </div>
          </div>

          <form onSubmit={saveSettings} className="space-y-4">
            <div
              className="rounded-xl p-5 space-y-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Admin WhatsApp</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Number that receives low-stock Place / Cancel tickets.
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: whatsappConnected ? "rgba(74, 222, 128, 0.12)" : "var(--surface-elevated)",
                    color: whatsappConnected ? "var(--green)" : "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {whatsappConnected ? "Business API connected" : "Business API not connected"}
                </span>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Mobile number
                </span>
                <input
                  type="tel"
                  value={adminWhatsapp}
                  onChange={(e) => {
                    setAdminWhatsapp(e.target.value);
                    if (adminWhatsappError) setAdminWhatsappError("");
                  }}
                  placeholder="10-digit Indian mobile"
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: `1px solid ${adminWhatsappError ? "var(--red)" : "var(--border)"}`,
                    color: "var(--text-primary)",
                  }}
                />
                {adminWhatsappError && (
                  <p className="text-xs" style={{ color: "var(--red)" }}>
                    {adminWhatsappError}
                  </p>
                )}
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {whatsappConnected
                    ? "Low-stock order tickets will be sent to this number for Place or Cancel."
                    : "Save the number now. No WhatsApp is sent until WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set, then the server is restarted."}
                </p>
              </label>
            </div>

            <div
              className="rounded-xl p-5 space-y-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
            <p className="text-sm font-medium">Slippage Tolerance</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Alert when bottle slippage exceeds this percentage on close.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Tolerance (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="w-24 rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <p className="text-sm font-medium pt-2">Shift Schedule</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Shift start and end for each day (24h). Leave both empty for closed days. Overnight shifts (end before start on the clock) are supported.
            </p>
            <div className="grid gap-4">
              {DAY_KEYS.map((key: DayKey) => {
                const day = schedule[key];
                const prefilledStart = day?.start ?? getPreviousDayShiftEnd(schedule, new Date()) ?? "";
                const canCopy = Boolean(day?.start || day?.end);
                return (
                  <div
                    key={key}
                    className="grid gap-2 rounded-lg p-3 sm:grid-cols-[7rem_1fr_1fr_auto] sm:items-end"
                    style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}
                  >
                    <span className="text-xs font-medium self-center" style={{ color: "var(--text-muted)" }}>
                      {formatDayLabel(key)}
                    </span>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Start</span>
                      <input
                        type="time"
                        value={day?.start ?? ""}
                        placeholder={prefilledStart || undefined}
                        onChange={(e) =>
                          setSchedule((prev) => ({
                            ...prev,
                            [key]: {
                              start: e.target.value || null,
                              end: prev[key]?.end ?? null,
                            },
                          }))
                        }
                        className="rounded-lg px-2 py-1.5 text-sm outline-none"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>End</span>
                      <input
                        type="time"
                        value={day?.end ?? ""}
                        onChange={(e) =>
                          setSchedule((prev) => ({
                            ...prev,
                            [key]: {
                              start: prev[key]?.start ?? null,
                              end: e.target.value || null,
                            },
                          }))
                        }
                        className="rounded-lg px-2 py-1.5 text-sm outline-none"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => copyDayToAll(key)}
                      disabled={!canCopy}
                      className="inline-flex items-center gap-1.5 justify-self-start rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-40"
                      style={{ color: "var(--accent)" }}
                      title="Copy this day's times to all other days"
                    >
                      <Copy size={14} />
                      Copy to all
                    </button>
                  </div>
                );
              })}
            </div>
            </div>

            {settingsMsg && (
              <p className="text-xs" style={{ color: settingsMsg.includes("failed") ? "var(--red)" : "var(--green)" }}>
                {settingsMsg}
              </p>
            )}
            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              {savingSettings ? "Saving…" : "Save Settings"}
            </button>
          </form>

          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm font-medium">Vendors</p>
            {vendors.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No vendors yet. Add one below to assign to bottles and stock orders.
              </p>
            ) : (
              <ul className="space-y-2">
                {vendors.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-lg px-3 py-2"
                    style={{ background: "var(--surface-elevated)", border: "1px solid var(--border-subtle)" }}
                  >
                    {editingVendorId === v.id ? (
                      <form onSubmit={saveVendorEdit} className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={editVendorName}
                          onChange={(e) => setEditVendorName(e.target.value)}
                          required
                          className="rounded-lg px-3 py-2 text-sm outline-none"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <input
                          type="tel"
                          value={editVendorPhone}
                          onChange={(e) => setEditVendorPhone(e.target.value)}
                          required
                          className="rounded-lg px-3 py-2 text-sm outline-none"
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <div className="sm:col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={savingVendor}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                            style={{ background: "var(--accent)", color: "#0e0e11" }}
                          >
                            {savingVendor ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditVendor}
                            className="rounded-lg px-3 py-1.5 text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{v.name}</p>
                          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            {v.whatsappNumber}
                          </p>
                          {v.products && v.products.length > 0 ? (
                            <p className="mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                              SKUs:{" "}
                              {v.products
                                .map((p) => (p.sku ? `${p.name} (${p.sku})` : p.name))
                                .join(", ")}
                            </p>
                          ) : (
                            <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                              No SKUs assigned
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => startEditVendor(v)}
                            className="rounded p-1.5"
                            style={{ color: "var(--accent)" }}
                            title="Edit vendor"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteVendor(v.id)}
                            className="rounded p-1.5"
                            style={{ color: "var(--red)" }}
                            title="Delete vendor"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={addVendor} className="grid gap-3 sm:grid-cols-2 pt-2">
              <input
                placeholder="Vendor name"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                required
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                type="tel"
                placeholder="WhatsApp number"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                required
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              {vendorError && (
                <p className="sm:col-span-2 text-xs" style={{ color: "var(--red)" }}>
                  {vendorError}
                </p>
              )}
              <button
                type="submit"
                disabled={addingVendor}
                className="sm:col-span-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0e0e11" }}
              >
                <Plus size={14} />
                {addingVendor ? "Adding…" : "Add Vendor"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
