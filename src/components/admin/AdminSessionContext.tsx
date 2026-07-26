"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type AdminSessionValue = {
  venueName: string;
  email: string | null;
  ready: boolean;
};

const AdminSessionContext = createContext<AdminSessionValue>({
  venueName: "My Restaurant",
  email: null,
  ready: false,
});

type MeResponse = {
  ok?: boolean;
  data?: {
    tenant?: { name: string };
    user?: { email: string };
  };
};

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [venueName, setVenueName] = useState("My Restaurant");
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (data.ok && data.data) {
          setVenueName(data.data.tenant?.name ?? "My Restaurant");
          setEmail(data.data.user?.email ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({ venueName, email, ready }),
    [venueName, email, ready],
  );

  return (
    <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
