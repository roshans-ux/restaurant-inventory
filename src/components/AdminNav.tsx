"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Wine,
  PackagePlus,
  Bell,
  Zap,
  GitBranch,
  Settings,
  LogOut,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/products", label: "Bottles", icon: Wine },
  { href: "/admin/stock", label: "Stock Entry", icon: PackagePlus },
  { href: "/admin/alerts", label: "Alerts", icon: Bell },
  { href: "/admin/mappings", label: "POS Mappings", icon: GitBranch },
  { href: "/admin/pos-sim", label: "POS Simulator", icon: Zap },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

type MeResponse = {
  ok?: boolean;
  data?: {
    tenant?: { name: string };
    user?: { email: string };
  };
};

export default function AdminNav({ authPaused = false }: { authPaused?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [venueName, setVenueName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (data.ok && data.data) {
          setVenueName(data.data.tenant?.name ?? null);
          setEmail(data.data.user?.email ?? null);
        }
      })
      .catch(() => {});
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav
      style={{ borderRight: "1px solid var(--border)" }}
      className="flex h-screen w-56 flex-shrink-0 flex-col overflow-y-auto"
    >
      <Link
        href="/"
        className="block px-5 py-5 transition-opacity hover:opacity-90"
        style={{ borderBottom: "1px solid var(--border)" }}
        title="Go to home"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label="bar">
            🍶
          </span>
          <div className="min-w-0">
            <span
              className="block text-sm font-semibold tracking-tight truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {venueName ?? "My Restaurant"}
            </span>
            <span className="block text-xs truncate" style={{ color: "var(--text-muted)" }}>
              Bar Inventory · Go to home
            </span>
          </div>
        </div>
      </Link>

      <div className="flex flex-col gap-0.5 p-2 flex-1">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150"
              style={{
                color: active ? "var(--accent)" : "var(--text-secondary)",
                background: active ? "var(--accent-dim)" : "transparent",
                fontWeight: active ? 500 : 400,
              }}
            >
              <Icon size={15} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          );
        })}
      </div>

      <div className="px-3 pb-4 pt-2 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
        {email && (
          <p className="px-2 text-xs truncate" style={{ color: "var(--text-muted)" }}>
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
  );
}
