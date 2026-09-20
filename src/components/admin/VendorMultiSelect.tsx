"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type VendorOption = { id: string; name: string };

export default function VendorMultiSelect({
  vendors,
  selectedIds,
  onChange,
  placeholder = "Select vendors…",
  required = false,
}: {
  vendors: VendorOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = vendors.filter((v) => selectedIds.includes(v.id));

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none"
        style={{
          background: "var(--surface-elevated)",
          border: `1px solid ${required && selectedIds.length === 0 ? "var(--red)" : "var(--border)"}`,
          color: "var(--text-primary)",
        }}
      >
        <span className="min-w-0 truncate" style={{ color: selected.length ? "var(--text-primary)" : "var(--text-muted)" }}>
          {selected.length ? selected.map((v) => v.name).join(", ") : placeholder}
        </span>
        <ChevronDown size={13} className="shrink-0" style={{ color: "var(--text-muted)" }} />
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg py-1 shadow-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {vendors.length === 0 ? (
            <p className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
              No vendors configured
            </p>
          ) : (
            vendors.map((v) => {
              const checked = selectedIds.includes(v.id);
              return (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:opacity-90"
                  style={{ background: checked ? "var(--accent-dim)" : "transparent" }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(v.id)} />
                  {v.name}
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
