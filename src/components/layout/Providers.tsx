"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/layout/AppShell";

// Remounts the AppProvider whenever the active account changes so the entire
// business-data tree is reloaded fresh from that account's scoped storage. This
// avoids effect-based data reloads (which React Compiler disallows) and keeps
// each account's data fully isolated.
export const Providers: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { account } = useAuth();
  const key = account?.id ?? "anon";
  return (
    <AppProvider key={key}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
};
