"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { formatBottleSizeLabel } from "@/lib/product-naming";

type BottleProduct = {
  id: string;
  name: string;
  bottleSizeMl: string | number;
};

type BottleSelectDropdownProps = {
  products: BottleProduct[];
  value: string;
  onChange: (productId: string) => void;
  /** When omitted, the “Add a new bottle” action is hidden. */
  onAddNew?: () => void;
  showError?: boolean;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number;
};

export default function BottleSelectDropdown({
  products,
  value,
  onChange,
  onAddNew,
  showError = false,
}: BottleSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === value);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) => {
      const sizeLabel = formatBottleSizeLabel(Number(p.bottleSizeMl)).toLowerCase();
      return p.name.toLowerCase().includes(query) || sizeLabel.includes(query);
    });
  }, [products, search]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectProduct(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  function handleAddNew() {
    setOpen(false);
    setSearch("");
    onAddNew?.();
  }

  const triggerLabel = selected
    ? `${selected.name} (${formatBottleSizeLabel(Number(selected.bottleSizeMl))})`
    : "Select bottle…";

  const panel =
    open && panelPosition ? (
      <div
        ref={panelRef}
        className="overflow-hidden rounded-lg shadow-lg"
        style={{
          position: "fixed",
          top: panelPosition.top,
          left: panelPosition.left,
          width: panelPosition.width,
          zIndex: 9999,
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="p-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bottles…"
            className="w-full rounded-md px-2 py-1.5 text-sm outline-none"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        <hr style={{ borderColor: "var(--border)", margin: 0 }} />

        <div className="max-h-[200px] overflow-y-auto">
          <button
            type="button"
            onClick={() => selectProduct("")}
            className="block w-full px-3 py-2 text-left text-sm transition-colors hover:opacity-90"
            style={{ color: "var(--text-muted)" }}
          >
            Select bottle…
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
              No bottles found
            </p>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProduct(p.id)}
                className="block w-full px-3 py-2 text-left text-sm transition-colors"
                style={{
                  color: "var(--text-primary)",
                  background: p.id === value ? "var(--accent-dim)" : "transparent",
                }}
              >
                {p.name} ({formatBottleSizeLabel(Number(p.bottleSizeMl))})
              </button>
            ))
          )}
        </div>

        {onAddNew ? (
          <>
            <hr style={{ borderColor: "var(--border)", margin: 0 }} />
            <button
              type="button"
              onClick={handleAddNew}
              className="block w-full px-3 py-2 text-left text-sm font-medium transition-colors"
              style={{ color: "var(--accent)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-dim)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              + Add a new bottle
            </button>
          </>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none"
        style={{
          background: "var(--surface-elevated)",
          border: `1px solid ${showError && !value ? "var(--red)" : "var(--border)"}`,
          color: value ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown size={13} style={{ color: "var(--text-muted)" }} className="ml-2 shrink-0" />
      </button>

      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
