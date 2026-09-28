"use client";

import { FormEvent, Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import {
  DATE_FORMAT_LABELS,
  RESOLUTION_CHANGE,
  RESOLUTION_IGNORE,
  RESOLUTION_SKIP,
  type AutoMappedPour,
  type CatalogMappingOption,
  type ImportDateFormat,
  type SalesImportColumnMapping,
  type UnmatchedItemGroup,
  type UnparseableDateRow,
} from "@/lib/sales-import/types";
import { dateParseExample, sampleDateValues } from "@/lib/sales-import/dates";

type PreviewState = {
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
  rowCount: number;
  mapping: SalesImportColumnMapping;
};

type MatchState = {
  fileName: string;
  rowCount: number;
  matched: number;
  alreadyImported: number;
  unmatched: UnmatchedItemGroup[];
  needsPourSize: UnmatchedItemGroup[];
  autoMappedPours: AutoMappedPour[];
  ignoredCount: number;
  skippedCount: number;
  unparseableDates: UnparseableDateRow[];
  invalidQuantity: number;
  dateRange: { start: string | null; end: string | null };
  dateExample: { raw: string; parsed: string } | null;
};

type BatchRow = {
  id: string;
  fileName: string;
  createdAt: string;
  rowsImported: number;
  rowsSkippedDuplicate: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
};

type DuplicateFileState = {
  fileName: string;
  createdAt: string;
};

function formatImportedOn(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const emptyMapping: SalesImportColumnMapping = {
  date: "",
  time: null,
  posItemId: null,
  itemName: null,
  quantity: "",
  billNumber: null,
  dateFormat: "dmy",
};

export default function ImportSalesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [mapping, setMapping] = useState<SalesImportColumnMapping>(emptyMapping);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [duplicateFile, setDuplicateFile] = useState<DuplicateFileState | null>(null);
  const [usedSavedMapping, setUsedSavedMapping] = useState(false);
  const [showMapping, setShowMapping] = useState(true);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CatalogMappingOption[]>([]);
  const [ignoredNames, setIgnoredNames] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const liveExample =
    preview && mapping.date
      ? dateParseExample(sampleDateValues(preview.previewRows, mapping.date), mapping.dateFormat)
      : match?.dateExample ?? null;

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/sales-import");
    const data = await readJsonResponse<{
      ok?: boolean;
      data?: {
        mappings?: CatalogMappingOption[];
        batches?: BatchRow[];
        ignoredNames?: string[];
      };
      error?: { message?: string };
    }>(res);
    if (!res.ok || data.ok === false) {
      throw new Error(getApiErrorMessage(data, "Could not load import history"));
    }
    setCatalog(data.data?.mappings ?? []);
    setBatches(data.data?.batches ?? []);
    setIgnoredNames(data.data?.ignoredNames ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadHistory();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  async function postFile(url: string, extra?: Record<string, string>) {
    if (!file) throw new Error("Choose a file first");
    const form = new FormData();
    form.set("file", file);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) form.set(k, v);
    }
    const res = await fetch(url, { method: "POST", body: form });
    const data = await readJsonResponse<{ ok?: boolean; data?: unknown; error?: { message?: string } }>(res);
    if (!res.ok) throw new Error(getApiErrorMessage(data, "Request failed"));
    return data.data;
  }

  async function onUpload(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setMatch(null);
    setDuplicateFile(null);
    setResolutions({});
    if (!file) {
      setError("Choose a CSV or Excel file");
      return;
    }
    setBusy(true);
    try {
      const data = (await postFile("/api/sales-import/preview")) as PreviewState &
        Partial<MatchState> & {
          ignoredNames?: string[];
          mappings?: CatalogMappingOption[];
          usedSavedMapping?: boolean;
          alreadyImportedFile?: DuplicateFileState;
        };
      if (data.alreadyImportedFile) {
        setDuplicateFile(data.alreadyImportedFile);
        setPreview(null);
        setMatch(null);
        setUsedSavedMapping(false);
        setShowMapping(false);
        return;
      }
      setPreview({
        fileName: data.fileName,
        headers: data.headers,
        previewRows: data.previewRows,
        rowCount: data.rowCount,
        mapping: data.mapping,
      });
      setMapping(data.mapping);
      if (data.ignoredNames) setIgnoredNames(data.ignoredNames);
      if (typeof data.matched === "number") {
        setMatch({
          fileName: data.fileName,
          rowCount: data.rowCount,
          matched: data.matched,
          alreadyImported: data.alreadyImported ?? 0,
          unmatched: data.unmatched ?? [],
          needsPourSize: data.needsPourSize ?? [],
          autoMappedPours: data.autoMappedPours ?? [],
          ignoredCount: data.ignoredCount ?? 0,
          skippedCount: data.skippedCount ?? 0,
          unparseableDates: data.unparseableDates ?? [],
          invalidQuantity: data.invalidQuantity ?? 0,
          dateRange: data.dateRange ?? { start: null, end: null },
          dateExample: data.dateExample ?? null,
        });
        setUsedSavedMapping(Boolean(data.usedSavedMapping));
        setShowMapping(!data.usedSavedMapping);
        if (data.mappings) setCatalog(data.mappings);
      } else {
        setUsedSavedMapping(false);
        setShowMapping(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runMatch(nextResolutions?: Record<string, string>) {
    const resolved = nextResolutions ?? resolutions;
    if (nextResolutions) setResolutions(nextResolutions);
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = (await postFile("/api/sales-import/match", {
        mapping: JSON.stringify(mapping),
        resolutions: JSON.stringify(resolved),
      })) as MatchState & { mappings?: CatalogMappingOption[]; ignoredNames?: string[] };
      setMatch({
        ...data,
        alreadyImported: data.alreadyImported ?? 0,
        autoMappedPours: data.autoMappedPours ?? [],
      });
      if (data.mappings) setCatalog(data.mappings);
      if (data.ignoredNames) setIgnoredNames(data.ignoredNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const data = (await postFile("/api/sales-import/commit", {
        mapping: JSON.stringify(mapping),
        resolutions: JSON.stringify(resolutions),
      })) as {
        rowsImported?: number;
        rowsSkippedDuplicate?: number;
        unmatchedSkipped?: number;
        dateRangeStart?: string | null;
        dateRangeEnd?: string | null;
      };
      setNotice(
        `Imported ${data.rowsImported ?? 0} rows` +
          (data.rowsSkippedDuplicate ? ` · skipped ${data.rowsSkippedDuplicate} duplicates` : "") +
          (data.unmatchedSkipped ? ` · skipped ${data.unmatchedSkipped} unmatched` : "") +
          (data.dateRangeStart && data.dateRangeEnd
            ? ` · ${data.dateRangeStart} to ${data.dateRangeEnd}`
            : ""),
      );
      setMatch(null);
      setPreview(null);
      setDuplicateFile(null);
      setUsedSavedMapping(false);
      setShowMapping(true);
      setFile(null);
      setFileInputKey((k) => k + 1);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteBatch(id: string) {
    if (!confirm("Delete this import? Forecast history from this file will be removed. Stock will not change.")) {
      return;
    }
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(`/api/sales-import/${id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ ok?: boolean; error?: { message?: string } }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Delete failed"));
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function unignore(name: string) {
    const res = await fetch("/api/sales-import/ignored", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remove: name }),
    });
    const data = await readJsonResponse<{ ok?: boolean; data?: { ignoredNames?: string[] } }>(res);
    if (res.ok && data.data?.ignoredNames) setIgnoredNames(data.data.ignoredNames);
  }

  function columnSelect(
    label: string,
    value: string | null,
    onChange: (next: string | null) => void,
    optional = false,
  ) {
    const headers = preview?.headers ?? [];
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">{optional ? "— none —" : "Choose column"}</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function resolutionSelect(
    group: UnmatchedItemGroup,
    mappingOptions: CatalogMappingOption[],
    placeholder?: string,
  ) {
    const raw = resolutions[group.key] ?? "";
    const value = raw === RESOLUTION_CHANGE ? "" : raw;
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {group.name} · {group.count} {group.count === 1 ? "row" : "rows"}
          {group.needsPourSize ? " · needs pour size" : ""}
        </span>
        <select
          value={value}
          onChange={(e) =>
            setResolutions((prev) => ({ ...prev, [group.key]: e.target.value }))
          }
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          <option value={RESOLUTION_SKIP}>Skip this time</option>
          <option value={RESOLUTION_IGNORE}>Ignore always (not alcohol)</option>
          {mappingOptions.map((opt) => (
            <option key={`${opt.kind}-${opt.posItemId}-${opt.pourMl ?? ""}`} value={opt.posItemId}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Import past sales</h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-secondary)" }}>
          Upload a POS export so BarTally can learn sales patterns faster. Imports are forecast history
          only — they do not deduct stock, create movements, or raise restock alerts.
        </p>
        <p className="mt-2 text-sm">
          <a
            href="/samples/sample-pos-export.csv"
            className="font-medium"
            style={{ color: "var(--accent)" }}
            download
          >
            Download a sample POS export
          </a>
          <span style={{ color: "var(--text-muted)" }}> · messy column names, 30 days, plus 3 unmatched items</span>
        </p>
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 text-sm" style={{ color: "var(--green)" }}>
          {notice}
        </p>
      )}

      <form
        onSubmit={onUpload}
        className="mb-6 rounded-xl p-5 space-y-4 max-w-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p className="text-sm font-medium">1. Upload CSV or Excel</p>
        <input
          key={fileInputKey}
          type="file"
          accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setMatch(null);
            setDuplicateFile(null);
            setUsedSavedMapping(false);
            setShowMapping(true);
          }}
          className="block w-full text-sm"
          style={{ color: "var(--text-secondary)" }}
        />
        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          {busy && !preview && !match ? "Reading…" : "Show preview"}
        </button>
      </form>

      {duplicateFile && (
        <div
          className="mb-6 max-w-2xl space-y-3 rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            This file was already imported on {formatImportedOn(duplicateFile.createdAt)} (
            {duplicateFile.fileName})
          </p>
          <button
            type="button"
            onClick={() => {
              setDuplicateFile(null);
              setFile(null);
              setFileInputKey((k) => k + 1);
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
        </div>
      )}

      {preview && showMapping && (
        <div
          className="mb-6 rounded-xl p-5 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-medium">
            Preview · {preview.fileName} · first {preview.previewRows.length} of {preview.rowCount} rows
          </p>
          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border-subtle)" }}>
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr style={{ background: "var(--surface-elevated)" }}>
                  {preview.headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium" style={{ color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {preview.headers.map((h) => (
                      <td key={h} className="whitespace-nowrap px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                        {row[h] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runMatch();
            }}
            className="space-y-4"
          >
            <p className="text-sm font-medium">2. Column mapping</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Remembered for this venue on the next upload.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {columnSelect("Date", mapping.date, (v) => setMapping((m) => ({ ...m, date: v ?? "" })))}
              {columnSelect("Time (optional)", mapping.time, (v) => setMapping((m) => ({ ...m, time: v })), true)}
              {columnSelect(
                "POS Item ID",
                mapping.posItemId,
                (v) => setMapping((m) => ({ ...m, posItemId: v })),
                true,
              )}
              {columnSelect(
                "Item Name",
                mapping.itemName,
                (v) => setMapping((m) => ({ ...m, itemName: v })),
                true,
              )}
              {columnSelect("Quantity", mapping.quantity, (v) => setMapping((m) => ({ ...m, quantity: v ?? "" })))}
              {columnSelect(
                "Bill / Invoice number (optional)",
                mapping.billNumber,
                (v) => setMapping((m) => ({ ...m, billNumber: v })),
                true,
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Date format
                </span>
                <select
                  value={mapping.dateFormat}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, dateFormat: e.target.value as ImportDateFormat }))
                  }
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  {(Object.keys(DATE_FORMAT_LABELS) as ImportDateFormat[]).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {DATE_FORMAT_LABELS[fmt]}
                    </option>
                  ))}
                </select>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {liveExample
                    ? `${liveExample.raw} → ${liveExample.parsed}`
                    : "No parseable date in the first rows yet"}
                </span>
              </label>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              {busy && preview && !match ? "Matching…" : "Match to POS mappings"}
            </button>
          </form>
        </div>
      )}

      {match && (
        <div
          className="mb-6 max-w-2xl space-y-4 rounded-xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-medium">3. Match summary</p>
          {usedSavedMapping && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Using your saved column mapping
              {" · "}
              <button
                type="button"
                className="font-medium"
                style={{ color: "var(--accent)" }}
                onClick={() => setShowMapping(true)}
              >
                change
              </button>
            </p>
          )}
          <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
            <li>{match.matched} rows matched</li>
            {(match.alreadyImported ?? 0) > 0 && (
              <li>
                {match.alreadyImported} rows already imported (will be skipped),{" "}
                {Math.max(0, match.matched - match.alreadyImported)} new rows
              </li>
            )}
            <li>
              {match.unmatched.reduce((n, g) => n + g.count, 0)} rows unmatched
              {match.unmatched.length ? ` (${match.unmatched.length} item names)` : ""}
            </li>
            {match.needsPourSize.length > 0 && (
              <li>
                {match.needsPourSize.reduce((n, g) => n + g.count, 0)} rows need a pour size
                {` (${match.needsPourSize.length} names)`}
              </li>
            )}
            {match.ignoredCount > 0 && <li>{match.ignoredCount} rows ignored (not alcohol)</li>}
            {match.skippedCount > 0 && <li>{match.skippedCount} rows skipped this time</li>}
            {match.invalidQuantity > 0 && <li>{match.invalidQuantity} rows missing quantity</li>}
            <li>
              Date range:{" "}
              {match.dateRange.start && match.dateRange.end
                ? `${match.dateRange.start} → ${match.dateRange.end}`
                : "—"}
            </li>
          </ul>

          {ignoredNames.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowIgnored((v) => !v)}
                className="text-sm font-medium"
                style={{ color: "var(--accent)" }}
              >
                {ignoredNames.length} ignored {ignoredNames.length === 1 ? "item" : "items"}
              </button>
              {showIgnored && (
                <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {ignoredNames.map((name) => (
                    <li key={name} className="flex items-center justify-between gap-2">
                      <span>{name}</span>
                      <button
                        type="button"
                        onClick={() => void unignore(name)}
                        className="text-xs"
                        style={{ color: "var(--red)" }}
                      >
                        Stop ignoring
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {match.unparseableDates.length > 0 && (
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--red)" }}>
                {match.unparseableDates.length} rows with unparseable dates
              </p>
              <ul className="mt-1 max-h-40 overflow-auto text-xs" style={{ color: "var(--text-muted)" }}>
                {match.unparseableDates.slice(0, 50).map((row) => (
                  <li key={`${row.rowNumber}-${row.rawDate}`}>
                    Row {row.rowNumber}: “{row.rawDate}” ({row.item})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(match.autoMappedPours ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Remembered pour sizes for this venue. Shown as matched.
              </p>
              <ul className="space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {match.autoMappedPours.map((g) => (
                  <li key={g.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span>
                      {g.name} · {g.count} {g.count === 1 ? "row" : "rows"} · {g.label}
                    </span>
                    <button
                      type="button"
                      className="text-xs"
                      style={{ color: "var(--accent)" }}
                      onClick={() =>
                        void runMatch({ ...resolutions, [g.key]: RESOLUTION_CHANGE })
                      }
                    >
                      change
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {match.needsPourSize.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                These names match a bottle with more than one pour size. Pick which mapping they mean.
              </p>
              {match.needsPourSize.map((g) => (
                <Fragment key={g.key}>{resolutionSelect(g, g.options.length ? g.options : catalog, "Choose pour size")}</Fragment>
              ))}
            </div>
          )}

          {match.unmatched.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Map unmatched names, skip them this time, or ignore them always if they are not alcohol.
              </p>
              {match.unmatched.map((g) => (
                <Fragment key={g.key}>{resolutionSelect(g, catalog)}</Fragment>
              ))}
            </div>
          )}

          {(match.unmatched.length > 0 || match.needsPourSize.length > 0) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runMatch()}
              className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              Rematch with these choices
            </button>
          )}

          <button
            type="button"
            disabled={
              busy ||
              match.matched - (match.alreadyImported ?? 0) <= 0
            }
            onClick={() => void onImport()}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            {busy ? "Importing…" : "Import matched rows"}
          </button>
        </div>
      )}

      <div
        className="rounded-xl p-5 max-w-3xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p className="mb-3 text-sm font-medium">Import history</p>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading…
          </p>
        ) : batches.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No imports yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="py-2 pr-3 font-medium">Imported</th>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Rows</th>
                  <th className="py-2 pr-3 font-medium">Date range</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="py-2 pr-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{b.fileName}</td>
                    <td className="py-2 pr-3 tabular-nums">{b.rowsImported}</td>
                    <td className="py-2 pr-3" style={{ color: "var(--text-secondary)" }}>
                      {b.dateRangeStart && b.dateRangeEnd
                        ? `${b.dateRangeStart} → ${b.dateRangeEnd}`
                        : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={deletingId === b.id}
                        onClick={() => void deleteBatch(b.id)}
                        className="text-xs font-medium disabled:opacity-50"
                        style={{ color: "var(--red)" }}
                      >
                        {deletingId === b.id ? "Deleting…" : "Delete this import"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Deleting a batch removes only those imported sales. Live POS sales and stock are untouched.
        </p>
        <p className="mt-2 text-xs">
          <Link href="/admin/mappings" style={{ color: "var(--accent)" }}>
            Review POS mappings
          </Link>
        </p>
      </div>
    </div>
  );
}
