import AdminNav from "@/components/AdminNav";
import { isAuthDisabled } from "@/lib/auth/auth-flags";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const authPaused = isAuthDisabled();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {authPaused && (
        <div
          className="shrink-0 px-4 py-2 text-center text-xs font-medium"
          style={{ background: "var(--amber-dim, #3d3000)", color: "var(--accent, #e8b84a)" }}
        >
          Auth paused for testing (DISABLE_AUTH=true). Turn off before sharing publicly.
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AdminNav authPaused={authPaused} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
