import GoHomeLink from "@/components/GoHomeLink";
import ThemeLightDocument from "@/components/ThemeLightDocument";

export default function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="theme-light relative flex min-h-screen flex-col"
      style={{ background: "var(--background)" }}
    >
      <ThemeLightDocument />
      <div className="absolute left-0 top-0 z-10 p-6">
        <GoHomeLink />
      </div>
      <div className="auth-copy flex flex-1 items-center justify-center p-6 pt-16">{children}</div>
    </div>
  );
}
