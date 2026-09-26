// Pure search-query helpers for the public Business Directory.
//
// This module is deliberately dependency-free: no Prisma, no `server-only`, no
// error classes. It lives apart from `directory-service.ts` for two reasons.
//
//  1. The query string arrives straight from an unauthenticated public
//     endpoint, so its length must be bounded before it reaches a database
//     filter. A caller can otherwise submit a megabyte-long `q`.
//  2. Keeping the decision pure makes the boundary directly executable in tests.
//     `directory-service.ts` cannot be imported from a test: it is a
//     `server-only` module that pulls in the Prisma client.
//
// The caller owns the rejection. `prepareDirectoryQuery` reports *whether* a
// query is acceptable and why; the service layer translates that into the real
// `ValidationError` so the existing error type and HTTP 400 mapping are
// preserved exactly.

/**
 * Maximum accepted length of the RAW converted query string.
 */
export const DIRECTORY_QUERY_MAX_LENGTH = 200;

/**
 * User-facing message for a query that exceeds DIRECTORY_QUERY_MAX_LENGTH.
 * The service layer throws this inside a ValidationError (mapped to HTTP 400).
 */
export const DIRECTORY_QUERY_TOO_LONG = "Search query is too long";

/**
 * Why a query was rejected. Kept as a literal so a new rejection reason cannot
 * be silently conflated with the length limit.
 */
export type DirectoryQueryRejection = "too-long";

export type DirectoryQueryResult =
  | { ok: true; value: string }
  | { ok: false; reason: DirectoryQueryRejection };

/**
 * Validate and normalize a raw public search query.
 *
 * The length limit is measured on the RAW converted input, BEFORE
 * trim/whitespace-collapse. Measuring afterwards would let a caller smuggle an
 * oversized request past the guard by padding it with whitespace, which is
 * exactly the case the limit exists to stop. Normalization can only shorten a
 * string, so this ordering is the stricter of the two.
 *
 * Normalization itself is unchanged from the original inline helper: collapse
 * runs of whitespace to a single space and trim the ends.
 */
export function prepareDirectoryQuery(v: unknown): DirectoryQueryResult {
  const s = String(v ?? "");

  if (s.length > DIRECTORY_QUERY_MAX_LENGTH) {
    return { ok: false, reason: "too-long" };
  }

  return { ok: true, value: s.trim().replace(/\s+/g, " ") };
}