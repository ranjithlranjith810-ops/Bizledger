"use client";

type ScopeListener = () => void;
const scopeListeners = new Set<ScopeListener>();

export function subscribeBusinessScope(fn: ScopeListener): () => void {
  scopeListeners.add(fn);
  return () => {
    scopeListeners.delete(fn);
  };
}

export function notifyBusinessScopeChanged(): void {
  scopeListeners.forEach((l) => l());
}

// Resolution of the authenticated user's backend business (tenant) before the
// app provider mounts. Three mutually exclusive states:
//   - loading  — session or business resolution still in flight. Never redirects.
//   - ready    — origin resolved: either the server-confirmed active business id
//                (onboarded) or null (authenticated with NO business yet, or an
//                anon visit). businessId === null here is the ONLY condition that
//                may divert an authenticated account into the onboarding wizard.
//   - error    — the session was authenticated but the business lookup failed
//                transiently (API/DB), or the account is blocked (e.g. suspended).
//                Never redirects; the user gets an explicit error + retry.
export type ProvidersResolution =
  | { status: "loading" }
  | { status: "ready"; businessId: string | null }
  | { status: "error"; statusCode: number | null; message: string };

export interface ResolvedBusinessRef {
  id: string;
  status: string;
}

// Maps a successful `GET /api/businesses` response to a ready state. An empty
// list is a SERVER-CONFIRMED "no business yet" and is the only case that yields
// businessId null for an authenticated account (genuine onboarding needed).
export function resolveBusinessQuery(
  data: { businesses?: ResolvedBusinessRef[] } | null | undefined
): Extract<ProvidersResolution, { status: "ready" }> {
  const list = Array.isArray(data?.businesses) ? data.businesses : [];
  const activeBusiness = list.find((b) => b.status === "ACTIVE") ?? list[0];
  return { status: "ready", businessId: activeBusiness?.id ?? null };
}

// Maps a failed `GET /api/businesses` to an error state. Crucially it is NOT a
// ready-with-null state: a transient failure must never be treated as "this
// account has no business and must run onboarding".
export function resolveBusinessFailure(error: unknown): Extract<ProvidersResolution, { status: "error" }> {
  const apiError = error as { status?: unknown; message?: unknown } | null;
  const statusCode =
    apiError && typeof apiError.status === "number"
      ? (apiError.status as number)
      : null;
  const message =
    apiError && typeof apiError.message === "string" && apiError.message.length > 0
      ? apiError.message
      : "Could not load your workspace.";
  return { status: "error", statusCode, message };
}

// The scope snapshot Providers keeps between async load() round-trips. It is
// tagged with the accountId the snapshot was computed FOR, so a stale
// resolution (e.g. the ready/null computed for an anon visitor while a freshly
// logged-in session was still settling) can never be re-used to mount an
// authenticated account with `businessId: null` — the exact race that stranded
// existing business users in the onboarding wizard.
export type BusinessScopeState = {
  accountId: string | null;
  resolution: ProvidersResolution;
};

// Returns the resolution that is safe to APPLY for `accountId`: only a snapshot
// computed for the same account id is usable. Anything else degrades to a
// non-redirecting "loading" state until Providers re-resolves for this account.
export function effectiveScopeResolution(
  state: BusinessScopeState,
  accountId: string | null | undefined
): ProvidersResolution {
  return state.accountId === accountId
    ? state.resolution
    : { status: "loading" };
}