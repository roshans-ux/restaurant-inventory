"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Wine,
  PackagePlus,
  Zap,
  GitBranch,
  Settings,
  LogOut,
  ArrowRightLeft,
  ClipboardList,
  Bell,
  BookOpen,
} from "lucide-react";
import NotificationsPopover from "@/components/admin/NotificationsPopover";
import { useAdminSession } from "@/components/admin/AdminSessionContext";

const links = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Live stock overview, sales trends, and shift reports",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/admin/products",
    label: "Bottles",
    description: "Add SKUs, bottle sizes, par levels, and vendors",
    icon: Wine,
  },
  {
    href: "/admin/stock",
    label: "Stock Entry",
    description: "Receive stock, log broken or returned bottles",
    icon: PackagePlus,
  },
  {
    href: "/admin/stock-orders",
    label: "Stock Orders",
    description: "Reorder when stock is low; place and track vendor orders",
    icon: ClipboardList,
  },
  {
    href: "/admin/handover",
    label: "Bottle Handover",
    description: "Scan bottles as you open them for the shift",
    icon: ArrowRightLeft,
  },
  {
    href: "/admin/mappings",
    label: "POS Mappings",
    description: "Match POS menu items to pours and cocktail recipes",
    icon: GitBranch,
  },
  {
    href: "/admin/pos-sim",
    label: "POS Simulator",
    description: "Test sales and see inventory deduct in real time",
    icon: Zap,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "API keys, shift times, slippage rules, and suppliers",
    icon: Settings,
  },
  {
    href: "/admin/docs/pos-integration",
    label: "Documentation",
    description: "POS webhook setup and integration guide",
    icon: BookOpen,
  },
];

export default function AdminNav({ authPaused = false }: { authPaused?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { venueName, email } = useAdminSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      if (data.ok) {
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchUnread();
    const interval = setInterval(() => void fetchUnread(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchUnread]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <nav
        style={{ borderRight: "1px solid var(--border)" }}
        className="flex h-full w-56 shrink-0 flex-col overflow-hidden"
      >
        <div
          className="flex items-start gap-2 px-5 py-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2 transition-opacity hover:opacity-90"
            aria-label="Go to home"
          >
            <span className="text-lg shrink-0" role="img" aria-hidden>
              🍶
            </span>
            <span
              className="block min-w-0 truncate text-sm font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {venueName ?? "My Restaurant"}
            </span>
          </Link>
          <button
            ref={bellRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setNotificationsOpen((prev) => !prev);
            }}
            className="relative shrink-0 rounded-full p-2 transition-opacity hover:opacity-80"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                style={{ background: "var(--red)", color: "#fff" }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {links.map(({ href, label, description, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-all duration-150"
                style={{
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-dim)" : "transparent",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon size={15} strokeWidth={active ? 2 : 1.5} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm leading-tight">{label}</span>
                  <span
                    className="mt-0.5 block text-xs leading-snug"
                    style={{ color: active ? "var(--text-secondary)" : "var(--text-muted)" }}
                  >
                    {description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        <div className="shrink-0 space-y-2 px-3 pb-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          {email && (
            <p className="truncate px-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {email}
            </p>
          )}
          {!authPaused && (
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-50"
              style={{ color: "var(--text-secondary)" }}
            >
              <LogOut size={15} strokeWidth={1.5} />
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      </nav>

      <NotificationsPopover
        open={notificationsOpen}
        onClose={() => {
          setNotificationsOpen(false);
          void fetchUnread();
        }}
        onUnreadChange={() => void fetchUnread()}
        anchorRef={bellRef}
      />
    </>
  );
}
