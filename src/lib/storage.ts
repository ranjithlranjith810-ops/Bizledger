// Shared localStorage keys and helpers for the temporary frontend auth/session
// and account-scoped business data. Kept in one place so the future backend
// migration can replace these keys cleanly.

export const ACCOUNT_KEY = "bizledger_account";
export const ACCOUNTS_KEY = "bizledger_accounts";
export const LAST_ROUTE_KEY = "bizledger_last_route";
export const DATA_VERSION_KEY = "bizledger_data_version";

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
