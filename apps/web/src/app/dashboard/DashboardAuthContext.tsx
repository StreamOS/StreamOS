"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardAuthUser } from "@streamos/types";

const DashboardAuthContext = createContext<DashboardAuthUser | null>(null);

export function DashboardAuthProvider({
  children,
  user,
}: {
  children: ReactNode;
  user: DashboardAuthUser;
}) {
  return (
    <DashboardAuthContext.Provider value={user}>
      {children}
    </DashboardAuthContext.Provider>
  );
}

export function useDashboardAuth() {
  const user = useContext(DashboardAuthContext);

  if (!user) {
    throw new Error(
      "useDashboardAuth must be used within DashboardAuthProvider.",
    );
  }

  return user;
}
