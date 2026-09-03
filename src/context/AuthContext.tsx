"use client";

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { LocalAccount, AuthContextType } from "@/types";
import {
  ACCOUNT_KEY,
  ACCOUNTS_KEY,
  LAST_ROUTE_KEY,
  safeGet,
  safeSet,
  safeRemove,
} from "@/lib/storage";

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

// Returns the persisted active account serialized. Used as the sync external
// store snapshot so the account is read from localStorage safely on the client
// (and is server-safe during SSR).
function getAccountSnapshot(): string {
  return safeGet(ACCOUNT_KEY) ?? "";
}

const getServerSnapshot = (): string => "";

function readAccounts(): LocalAccount[] {
  const raw = safeGet(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalAccount[]) : [];
  } catch {
    return [];
  }
}

function emit(): void {
  listeners.forEach((l) => l());
}

function isKnownAccount(email: string): boolean {
  return readAccounts().some(
    (a) => a.email.trim().toLowerCase() === email.trim().toLowerCase()
  );
}

function persistActiveAccount(acct: LocalAccount | null): void {
  if (acct) {
    safeSet(ACCOUNT_KEY, JSON.stringify(acct));
    const accounts = readAccounts();
    const without = accounts.filter((a) => a.id !== acct.id);
    safeSet(ACCOUNTS_KEY, JSON.stringify([acct, ...without]));
  } else {
    safeRemove(ACCOUNT_KEY);
  }
  emit();
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const accountRaw = useSyncExternalStore(
    subscribe,
    getAccountSnapshot,
    getServerSnapshot
  );

  const account = useMemo<LocalAccount | null>(() => {
    if (!accountRaw) return null;
    try {
      return JSON.parse(accountRaw) as LocalAccount;
    } catch {
      return null;
    }
  }, [accountRaw]);

  const [lastRoute, setLastRouteState] = useState<string | null>(() =>
    safeGet(LAST_ROUTE_KEY)
  );

  const setLastRoute: AuthContextType["setLastRoute"] = (route) => {
    setLastRouteState(route);
    safeSet(LAST_ROUTE_KEY, route);
  };

  const createAccount: AuthContextType["createAccount"] = (input) => {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = readAccounts().find(
      (a) => a.email.trim().toLowerCase() === normalizedEmail
    );
    if (existing) {
      persistActiveAccount(existing);
      return existing;
    }
    const acct: LocalAccount = {
      id: `acct-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: input.name.trim(),
      email: normalizedEmail,
      businessName: input.businessName?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    persistActiveAccount(acct);
    return acct;
  };

  const login: AuthContextType["login"] = (email) => {
    if (!isKnownAccount(email)) return false;
    const match = readAccounts().find(
      (a) => a.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
    if (match) {
      persistActiveAccount(match);
      return true;
    }
    return false;
  };

  const logout = () => {
    persistActiveAccount(null);
  };

  const value: AuthContextType = {
    account,
    isAuthenticated: !!account,
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
