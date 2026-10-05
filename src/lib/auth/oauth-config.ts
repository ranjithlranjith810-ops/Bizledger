// Env-gated Google OAuth configuration helpers.
//
// This module contains NO secret values and no `process.env` reads — callers
// pass the values in, which keeps it importable from both the server auth
// config and client components (and trivially unit-testable).
//
// Security rule: the Google CLIENT SECRET must only ever live in a gitignored
// server-side env file and must never reach a client bundle. The client pages
// only receive the PUBLIC "is Google enabled" boolean
// (NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED), never credentials.
export function googleOAuthEnabled(
  clientId: string | undefined,
  clientSecret: string | undefined
): boolean {
  return Boolean(clientId && clientSecret);
}

export function googleButtonVisible(enabledFlag: string | undefined): boolean {
  return enabledFlag === "true";
}