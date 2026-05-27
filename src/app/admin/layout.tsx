import AdminNav from "@/components/AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminNav />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
