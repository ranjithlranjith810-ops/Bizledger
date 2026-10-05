// Shared localStorage keys and helpers for the temporary frontend auth/session
// and account-scoped business data. Kept in one place so the future backend
// migration can replace these keys cleanly.

export const ACCOUNT_KEY = "bizledger_account";
export const ACCOUNTS_KEY = "bizledger_accounts";
export const LAST_ROUTE_KEY = "bizledger_last_route";
export const DATA_VERSION_KEY = "bizledger_data_version";

// Per-tab signal that the user explicitly chose "Home" from the onboarding
// wizard. The home page consumes it once and renders the public landing page
// instead of the normal app-entry redirect, so leaving the wizard actually
// lands on `/` without disabling the onboarding guard for other entries.
export const ONBOARDING_HOME_EXIT_KEY = "bizledger_onboarding_home_exit";

// Prefix applied to every account-scoped business data key.
export const DATA_KEY_PREFIX = "bizledger:data:";

export function dataKey(accountId: string, entity: string): string {
  return `${DATA_KEY_PREFIX}${accountId}:${entity}`;
}

export function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

// sessionStorage variants: used for short-lived, per-tab navigation signals
// (e.g. the onboarding "Home" exit) that should clear when the tab closes.
export function safeSessionGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function safeSessionRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
