"use client";

import { useState } from "react";
import StraightPoursTab from "@/components/admin/mappings/StraightPoursTab";
import CocktailsTab from "@/components/admin/mappings/CocktailsTab";

type MappingsTab = "pours" | "cocktails";

export default function MappingsPage() {
  const [tab, setTab] = useState<MappingsTab>("pours");

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">POS Mappings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {tab === "pours"
            ? "Spirits get 30ml, 60ml, and full-bottle rows automatically; beer gets one full-bottle row. Click a POS Item ID in the table to configure, or use the form for spirits."
            : "Map POS cocktail items to one or more alcohol pours. Each sale deducts every ingredient from inventory."}
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {(
          [
            { id: "pours" as const, label: "Straight Pours" },
            { id: "cocktails" as const, label: "Cocktails" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
            style={{
              background: tab === id ? "var(--accent-dim)" : "transparent",
              color: tab === id ? "var(--accent)" : "var(--text-secondary)",
              border: `1px solid ${tab === id ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === "pours" ? "block" : "none" }}>
        <StraightPoursTab active={tab === "pours"} />
      </div>
      <div style={{ display: tab === "cocktails" ? "block" : "none" }}>
        <CocktailsTab />
      </div>
    </div>
  );
}
