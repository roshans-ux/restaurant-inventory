"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyCodeBlock({
  label,
  value,
}: {
  label?: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {label && (
        <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
      )}
      <div className="flex gap-2">
        <pre
          className="min-w-0 flex-1 overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
          }}
        >
          <code>{value}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 self-start rounded-lg px-3 py-2"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
          title="Copy"
        >
          {copied ? <Check size={14} style={{ color: "var(--green)" }} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
