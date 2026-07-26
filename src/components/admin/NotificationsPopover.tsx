"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AlertType } from "@prisma/client";

type AlertItem = {
  id: string;
  type: AlertType;
  message: string;
  createdAt: string;
  readAt: string | null;
  product: { name: string };
};

type PanelPosition = {
  top: number;
  left: number;
};

type NotificationsPopoverProps = {
  open: boolean;
  onClose: () => void;
  onUnreadChange: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
};

const PANEL_WIDTH = 380;

function typeLabel(type: AlertType): string {
  return type === AlertType.SLIPPAGE ? "Slippage" : "Low stock";
}

function NotificationRow({
  alert,
  marking,
  onMarkRead,
}: {
  alert: AlertItem;
  marking: boolean;
  onMarkRead: (id: string) => void;
}) {
  const isSlippage = alert.type === AlertType.SLIPPAGE;
  const unread = alert.readAt == null;
  const accent = isSlippage ? "var(--red)" : "var(--accent)";

  return (
    <div
      className="group relative flex gap-3 px-4 py-3 transition-colors"
      style={{
        borderBottom: "1px solid var(--border)",
        borderLeft: `3px solid ${unread ? accent : "transparent"}`,
        background: "transparent",
        opacity: unread ? 1 : 0.65,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-elevated)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="flex w-3 shrink-0 justify-center pt-1.5">
        {unread ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: accent }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1 pr-20">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {alert.product.name}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {typeLabel(alert.type)}
          </span>
        </div>
        <p
          className="mt-1 line-clamp-2 text-sm leading-snug"
          style={{ color: "var(--text-secondary)" }}
        >
          {alert.message}
        </p>
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {new Date(alert.createdAt).toLocaleString()}
        </p>
      </div>

      {unread && (
        <button
          type="button"
          disabled={marking}
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(alert.id);
          }}
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
          style={{
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          {marking ? "…" : "Mark as read"}
        </button>
      )}
    </div>
  );
}

export default function NotificationsPopover({
  open,
  onClose,
  onUnreadChange,
  anchorRef,
}: NotificationsPopoverProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = alerts.filter((a) => a.readAt == null).length;

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      if (data.ok) {
        setAlerts(data.alerts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadAlerts();
  }, [open, loadAlerts]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const preferredLeft = rect.right + 8;
      const maxLeft = window.innerWidth - PANEL_WIDTH - 8;
      const left = Math.max(8, Math.min(preferredLeft, maxLeft));
      const top = Math.min(rect.top, window.innerHeight - 120);
      setPanelPosition({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorRef]);

  async function markRead(alertIds?: string[]) {
    const body =
      alertIds && alertIds.length > 0 ? { alertIds } : {};
    const res = await fetch("/api/alerts/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    return true;
  }

  async function handleMarkOne(id: string) {
    setMarkingId(id);
    try {
      const ok = await markRead([id]);
      if (!ok) return;
      const now = new Date().toISOString();
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, readAt: now } : a)),
      );
      onUnreadChange();
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAll() {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const ok = await markRead();
      if (!ok) return;
      const now = new Date().toISOString();
      setAlerts((prev) => prev.map((a) => ({ ...a, readAt: a.readAt ?? now })));
      onUnreadChange();
    } finally {
      setMarkingAll(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Transparent capture layer — no dim */}
      <div className="fixed inset-0 z-[9998]" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="fixed z-[9999] flex flex-col overflow-hidden rounded-xl shadow-xl"
        style={{
          top: panelPosition?.top ?? 0,
          left: panelPosition?.left ?? 0,
          width: PANEL_WIDTH,
          maxHeight: "min(480px, 70dvh)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          visibility: panelPosition ? "visible" : "hidden",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                style={{ background: "var(--red)", color: "#fff" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close notifications"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="shrink-0 px-4 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <button
            type="button"
            disabled={unreadCount === 0 || markingAll}
            onClick={() => void handleMarkAll()}
            className="w-full rounded-lg px-3 py-2 text-xs font-medium transition-opacity disabled:opacity-40"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "var(--surface-elevated)",
            }}
          >
            {markingAll ? "Marking…" : "Mark all as read"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </p>
          ) : alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
              No notifications
            </p>
          ) : (
            alerts.map((alert) => (
              <NotificationRow
                key={alert.id}
                alert={alert}
                marking={markingId === alert.id}
                onMarkRead={(id) => void handleMarkOne(id)}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
