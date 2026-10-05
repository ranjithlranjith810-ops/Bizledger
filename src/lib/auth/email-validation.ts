// Shared email normalization + validation for the signup/login flows.
//
// Emails are normalized (trim + lowercase) BEFORE any check, so that
// "  User@Example.COM " is handled as "user@example.com".
//
// The format check uses the practical pattern used across the app:
//     /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// which requires a local part, an "@", a domain, and a TLD separator. It does
// NOT restrict to any provider — Gmail, Outlook, Yahoo, custom/company domains,
// and any TLD (.com, .in, .co.in, ...) all pass.
//
// On top of that pattern, a local part with consecutive dots ("user..name@…")
// is explicitly rejected: the pattern alone would accept it, but it is not a
// well-formed email.
//
// This module (and its message) is shared by the client-side forms/contexts AND
// the server-side Better Auth boundary (see src/lib/auth.ts "before" hook) so a
// malformed address is rejected in the UI and cannot be bypassed at the API.

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_INVALID_MESSAGE = "Please enter a valid email address.";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True iff `email` is a non-empty, well-formed email address. */
export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) return false;
  // Consecutive dots are not a valid local/domain label.
  if (normalized.includes("..")) return false;
  return true;
}