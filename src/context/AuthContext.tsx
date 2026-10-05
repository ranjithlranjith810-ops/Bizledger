"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LocalAccount, AuthContextType } from "@/types";
import { LAST_ROUTE_KEY, safeGet, safeSet, safeRemove } from "@/lib/storage";
import { authClient } from "@/lib/auth-client";
import { normalizeEmail, isValidEmail, EMAIL_INVALID_MESSAGE } from "@/lib/auth/email-validation";

// Transition: the previous mock-auth implementation kept the active account in
// localStorage (ACCOUNT_KEY / ACCOUNTS_KEY). Those keys are no longer read or
// written; the Better Auth session cookie is the only auth authority. Stale
// values are purged on first mount so they cannot affect routing or identity.
function clearLegacyAccountKeys(): void {
  safeRemove("bizledger_account");
  safeRemove("bizledger_accounts");
}

/** Friendly message shown when a reset token is invalid, expired, or already used. */
export const INVALID_RESET_LINK_MESSAGE =
  "This password-reset link is invalid or has expired. Please request a new password-reset email.";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// If the Better Auth session lookup has not settled after this long (e.g. the
// dev server is hung/recompiling, or a request is stuck in a dead queue), the
// session is surfaced as `authError` so the shell shows a recoverable error
// screen instead of the "Loading BizLedger" spinner forever. The lookup either
// resolves (data set, isPending -> false), rejects (error set), or hangs — the
// hang is the ONLY outcome the atom cannot self-resolve, so it must be bounded.
const SESSION_LOOKUP_TIMEOUT_MS = 20000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data, error, isPending } = authClient.useSession();

  // Watchdog: a session fetch that never settles must not leave the app on an
  // indefinite spinner. Once the timeout fires, `authError` follows and the
  // shell renders the recoverable session-error screen (Sign in / Retry). The
  // flag clears automatically when the next lookup actually settles.
  const [sessionLookupTimedOut, setSessionLookupTimedOut] = useState(false);
  useEffect(() => {
    if (!isPending) {
      // Clear the flag once the lookup has actually settled — deferred to a
      // callback so the reset itself never triggers a synchronous render.
      const clearTimer = setTimeout(() => setSessionLookupTimedOut(false), 0);
      return () => clearTimeout(clearTimer);
    }
    const timer = setTimeout(() => setSessionLookupTimedOut(true), SESSION_LOOKUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  // In-flight sign-out guard so a double-click on any logout button does not
  // fire concurrent sign-out requests. The resolved (or failed) request is
  // cleared so the next explicit logout always works.
  const logoutInFlight = useRef<Promise<void> | null>(null);

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
    const email = normalizeEmail(input.email);
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!isValidEmail(email)) {
      return { ok: false, error: EMAIL_INVALID_MESSAGE };
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
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: EMAIL_INVALID_MESSAGE };
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
    if (logoutInFlight.current) return logoutInFlight.current;
    logoutInFlight.current = (async () => {
      try {
        await authClient.signOut();
      } catch {
        // Failure-safe: a network/server failure during sign-out must not block
        // navigation — the client clears its UI session state and the caller
        // redirects to /login, where the next get-session re-confirms state.
      } finally {
        logoutInFlight.current = null;
      }
    })();
    return logoutInFlight.current;
  };

  const requestPasswordReset: AuthContextType["requestPasswordReset"] = async (
    input,
  ) => {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: EMAIL_INVALID_MESSAGE };
    }
    // The endpoint answers uniformly for known, unknown, and invalid accounts
    // so account existence is never revealed. Work is only skipped client-side
    // for an obviously malformed address.
    //
    // IMPORTANT: `redirectTo` is intentionally NOT sent. When `redirectTo` is
    // provided, this Better Auth version builds the email link against its own
    // server route `/api/auth/reset-password/<token>?callbackURL=...`, which
    // server-side redirects the browser to the callback URL instead of the app
    // page — the reset form then never appears (fresh tokens land on the login
    // page, consumed/stale tokens on an error). WITHOUT `redirectTo`, the link
    // is the app page `http://localhost:3000/reset-password/<token>`, which
    // renders the form and redirects to /login itself after a successful save.
    const res = await authClient.requestPasswordReset({ email });
    if (res.error) {
      return { ok: false, error: errorMessage(res.error) };
    }
    console.info("[auth/reset] reset-request sent: attempt category=sent");
    return { ok: true };
  };

  const resetPassword: AuthContextType["resetPassword"] = async (input) => {
    const token = input.token.trim();
    if (!token) {
      console.info("[auth/reset] reset submission: invalid (token empty)");
      return { ok: false, error: INVALID_RESET_LINK_MESSAGE };
    }
    if (input.newPassword.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters long." };
    }
    console.info("[auth/reset] reset submission: attempted (token present: yes)");
    const res = await authClient.resetPassword({
      newPassword: input.newPassword,
      token,
    });
    if (res.error) {
      const code = (res.error as { code?: string }).code;
      // A stale, consumed, expired, or tampered token is surfaced as a friendly
      // BizLedger hint (with a "request a new reset" path) — never a raw code.
      if (code === "INVALID_TOKEN" || code === "INVALID_URL") {
        console.info("[auth/reset] reset result: invalid/expired/used");
        return { ok: false, error: INVALID_RESET_LINK_MESSAGE };
      }
      console.info("[auth/reset] reset result: failure");
      return { ok: false, error: errorMessage(res.error) };
    }
    console.info("[auth/reset] reset result: success");
    return { ok: true };
  };

  const verifyEmail: AuthContextType["verifyEmail"] = async (input) => {
    const res = await authClient.verifyEmail({
      query: {
        token: input.token,
        ...(input.callbackURL ? { callbackURL: input.callbackURL } : {}),
      },
    });
    if (res.error) {
      return { ok: false, error: errorMessage(res.error) };
    }
    return { ok: true };
  };

  const sendVerificationEmail: AuthContextType["sendVerificationEmail"] = async (
    input,
  ) => {
    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { ok: false, error: EMAIL_INVALID_MESSAGE };
    }
    // Same uniform-response contract as requestPasswordReset: the endpoint does
    // not reveal whether the account exists or is already verified.
    const res = await authClient.sendVerificationEmail({ email });
    if (res.error) {
      return { ok: false, error: errorMessage(res.error) };
    }
    return { ok: true };
  };

  const isAuthenticated = !!account;

  const value: AuthContextType = {
    account,
    isAuthenticated,
    authPending: isPending,
    authError: error ? true : sessionLookupTimedOut,
    lastRoute,
    createAccount,
    login,
    logout,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    sendVerificationEmail,
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