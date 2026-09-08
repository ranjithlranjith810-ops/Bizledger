"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { LocalAccount, AuthContextType } from "@/types";
import { LAST_ROUTE_KEY, safeGet, safeSet, safeRemove } from "@/lib/storage";
import { authClient } from "@/lib/auth-client";

// Transition: the previous mock-auth implementation kept the active account in
// localStorage (ACCOUNT_KEY / ACCOUNTS_KEY). Those keys are no longer read or
// written; the Better Auth session cookie is the only auth authority. Stale
// values are purged on first mount so they cannot affect routing or identity.
function clearLegacyAccountKeys(): void {
  safeRemove("bizledger_account");
  safeRemove("bizledger_accounts");
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data, isPending } = authClient.useSession();

  const account = useMemo<LocalAccount | null>(() => {
    if (!data?.user) return null;
    const u = data.user;
    return {
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      businessName: undefined,
      createdAt: u.createdAt ? String(u.createdAt) : new Date().toISOString(),
    };
  }, [data]);

  const [lastRoute, setLastRouteState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    clearLegacyAccountKeys();
    return safeGet(LAST_ROUTE_KEY);
  });

  const setLastRoute: AuthContextType["setLastRoute"] = (route) => {
    setLastRouteState(route);
    safeSet(LAST_ROUTE_KEY, route);
  };

  const errorMessage = (e: unknown): string => {
    if (!e) return "Something went wrong. Please try again.";
    const err = e as { status?: number; message?: string; details?: unknown };
    if (err.message) return err.message;
    return `Request failed${err.status ? ` (${err.status})` : ""}. Please try again.`;
  };

  const createAccount: AuthContextType["createAccount"] = async (input) => {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (input.password !== undefined && input.password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters long." };
    }
    const res = await authClient.signUp.email({ email, password: input.password, name });
    if (res.error) {
      return { ok: false, error: errorMessage(res.error) };
    }
    return { ok: true };
  };

  const login: AuthContextType["login"] = async (input) => {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (!input.password) {
      return { ok: false, error: "Please enter your password." };
    }
    const res = await authClient.signIn.email({ email, password: input.password });
    if (res.error) {
      return { ok: false, error: errorMessage(res.error) };
    }
    return { ok: true };
  };

  const logout = async () => {
    await authClient.signOut();
  };

  const isAuthenticated = !!account;

  const value: AuthContextType = {
    account,
    isAuthenticated,
    authPending: isPending,
    lastRoute,
    createAccount,
    login,
    logout,
    setLastRoute,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};