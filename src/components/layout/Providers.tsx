"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/layout/AppShell";
import { http } from "@/lib/api-client";
import { subscribeBusinessScope } from "@/lib/business-scope";

interface ResolvedBusiness {
  id: string;
  status: string;
}

// Resolves the authenticated user's backend business (tenant) before mounting
// the app provider. The resolved business id feeds every API call; localStorage
// transition data stays keyed by the auth user id so onboarding data survives
// the scope resolution. An anon visit (public marketing/legal pages) resolves
// immediately with no business.
export const Providers: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { account, authPending } = useAuth();
  const [resolved, setResolved] = useState<{
    ready: boolean;
    businessId: string | null;
  } | null>(null);

  useEffect(() => {
    if (authPending) return;
    let active = true;

    const load = async () => {
      let businessId: string | null = null;
      if (account) {
        try {
          const data = await http.get<{ businesses: ResolvedBusiness[] }>("/api/businesses");
          const list = Array.isArray(data?.businesses) ? data.businesses : [];
          const activeBusiness =
            list.find((b) => b.status === "ACTIVE") ?? list[0];
          businessId = activeBusiness?.id ?? null;
        } catch {
          businessId = null;
        }
      }
      if (active) setResolved({ ready: true, businessId });
    };

    load();
    const unsubscribe = subscribeBusinessScope(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authPending, account?.id]);

  if (!resolved?.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <span className="material-symbols-outlined animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <AppProvider key={account?.id ?? "anon"} activeBusinessId={resolved.businessId}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
};