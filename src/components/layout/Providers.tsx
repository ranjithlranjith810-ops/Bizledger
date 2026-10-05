"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { AppShell } from "@/components/layout/AppShell";
import { BizLedgerLoader } from "@/components/ui/BizLedgerLoader";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";
import { http } from "@/lib/api-client";
import { Icon } from "../ui/Icon";
import {
  ResolvedBusinessRef,
  BusinessScopeState,
  resolveBusinessQuery,
  resolveBusinessFailure,
  effectiveScopeResolution,
  subscribeBusinessScope,
} from "@/lib/business-scope";

// Upper bound for the authenticated workspace lookup (GET /api/businesses). If
// the request has not settled after this, it is aborted and surfaced as the
// recoverable error screen so an authenticated account can never be stranded on
// the "Loading BizLedger" spinner by a hung server.
const SCOPE_LOOKUP_TIMEOUT_MS = 15000;

// Resolves the authenticated user's backend business (tenant) before mounting
// the app provider. The resolved business id feeds every API call; localStorage
// transition data stays keyed by the auth user id so onboarding data survives
// the scope resolution. An anon visit (public marketing/legal pages) resolves
// immediately with no business.
//
// Resolution is explicit: loading / ready(businessId | null) / error. Only a
// SERVER-CONFIRMED ready-with-null business may route an authenticated account
// into the onboarding wizard; a transient lookup failure surfaces an error with
// a Retry action instead of a redirect, so an existing onboarded user is never
// bounced to /onboarding because of a backend hiccup or dev-server restart.
export const Providers: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { account, authPending, authError, logout } = useAuth();
  // Normalized to null for an anon visit: `account?.id` is `undefined` and the
  // anon scope snapshot is tagged `null`, so a strict comparison
  // (effectiveScopeResolution: state.accountId === accountId) would otherwise
  // return "loading" forever — the infinite BizLedger spinner seen on protected
  // routes when the session is null. Both the anon and authenticated paths now
  // use a consistent null/string tag.
  const accountId = account?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  // The scope snapshot is tagged with the accountId it was resolved FOR.
  // effectiveScopeResolution only applies a snapshot to the account that it
  // belongs to; while a session/account settles (e.g. straight after login) the
  // stale anon "ready/null" snapshot is treated as loading so an authenticated
  // account can never be mounted with a premature businessId === null.
  const [scope, setScope] = useState<BusinessScopeState>({
    accountId: null,
    resolution: { status: "loading" },
  });

  useEffect(() => {
    if (authPending) return;
    let active = true;
    const accountForScope = accountId;

    const load = async () => {
      if (!accountForScope) {
        if (active) setScope({ accountId: null, resolution: { status: "ready", businessId: null } });
        return;
      }
      // Bound the scope lookup: a hung server / frozen request queue (the
      // dev-server corruption class seen in this project) must surface the
      // recoverable error screen instead of spinning "Loading BizLedger" until
      // the page is killed. On timeout the fetch is aborted and mapped to the
      // existing error state (Retry re-runs the lookup).
      //
      // One attempt that ends in a TIMEOUT ABORT is retried transparently:
      // the most common trigger here is not a hung backend but a cold first-hit
      // dev-server route compile (`/api/businesses` pulls in a graph of 1700+
      // modules and can stall several seconds at first compile), which the
      // retry rides out against the now-warm compiler. A genuine failure is
      // still surfaced (only configurable timeouts are retried, and only once),
      // so a truly hung server shows the exact recoverable error screen below.
      const lookupOnce = async (): Promise<boolean> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SCOPE_LOOKUP_TIMEOUT_MS);
        try {
          const data = await http.get<{ businesses: ResolvedBusinessRef[] }>(
            "/api/businesses",
            { signal: controller.signal }
          );
          if (active) setScope({ accountId: accountForScope, resolution: resolveBusinessQuery(data) });
          return true;
        } catch (error) {
          if (active && !controller.signal.aborted) {
            setScope({ accountId: accountForScope, resolution: resolveBusinessFailure(error) });
            return true;
          }
          return false;
        } finally {
          clearTimeout(timer);
        }
      };
      // Ends on the first definitive outcome; a timeout abort returns false so
      // a single cold-compile stall can be retried without hiding real errors.
      if (!(await lookupOnce())) {
        if (!active) return;
        const resolved = await lookupOnce();
        if (!resolved && active) {
          setScope({
            accountId: accountForScope,
            resolution: resolveBusinessFailure(
              new Error("The workspace lookup timed out. Please try again.")
            ),
          });
        }
      }
    };

    load();
    const unsubscribe = subscribeBusinessScope(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authPending, accountId, attempt]);

  const resolution = effectiveScopeResolution(scope, accountId);

  const renderErrorPanel = (title: string, message: string, retry: () => void) => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-on-surface">
      <div className="w-full max-w-md rounded-2xl border border-[#eceef0] bg-surface-container-lowest p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <BizLedgerLogo size="default" />
        </div>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-on-surface/70">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={retry}
            className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
          >
            <Icon name="refresh" className="text-[16px]" />
            Retry
          </button>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:bg-[#f7f9fb] px-4 py-2.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  // The session lookup errored or was bounded by the timeout watchdog AND there
  // is no account to fall back to (a hung or failed check yields no identity to
  // scope against). Show the recoverable error panel (reload re-runs the full
  // session + scope lookup) instead of any loader. A still-authenticated session
  // that returned stale data keeps mounting normally.
  if (authError && !account) {
    return renderErrorPanel(
      "Couldn't check your session",
      "A network or server error interrupted the sign-in check. Please try again.",
      () => window.location.reload()
    );
  }

  if (resolution.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <BizLedgerLoader size="lg" label="Loading BizLedger" />
      </div>
    );
  }

  if (resolution.status === "error") {
    return renderErrorPanel(
      "Couldn't load your workspace",
      `${resolution.statusCode ? `Server error (${resolution.statusCode}). ` : ""}${resolution.message}`,
      () => setAttempt((n) => n + 1)
    );
  }

  return (
    <AppProvider key={account?.id ?? "anon"} activeBusinessId={resolution.businessId}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
};