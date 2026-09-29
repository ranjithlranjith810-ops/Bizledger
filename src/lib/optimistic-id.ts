// Fix C - distinguishing an OPTIMISTIC client id from a PERSISTED database id.
//
// Every document create flow in AppContext inserts an optimistic row into state
// under a client-minted id, POSTs the document, and then swaps in the server
// record. That optimistic id is NOT a database id. It must never be treated as
// one, because doing so produces a wrong-but-plausible failure:
//
//   - in a URL            -> /estimates/est-1790587061616 -> "Estimate not found."
//   - in a conversion POST -> sourceDocument.id = "est-..." -> 404 from the server
//   - in a PATCH           -> the row can never be found
//
// The ids the app mints locally all share a `<prefix>-` shape (see makeId() in
// AppContext, which is the single generator used here). Persisted ids are minted
// by the database (cuid-style, e.g. "cmul1bemv000234e3pob8cqb0") and therefore
// never begin with one of these prefixes. Matching on the PREFIX - not on length
// or shape - is what keeps this check from rejecting short-but-real ids.

/**
 * Prefixes reserved for client-side optimistic rows. A persisted database id
 * never starts with any of these.
 *
 * The first four are the sales-document families covered by Fix C; the remainder
 * are the other optimistic domains in the same context (expenses, vehicles,
 * team members, customers, products, notifications, financial years) so a stray
 * optimistic id is rejected consistently no matter which surface received it.
 */
export const TEMPORARY_ID_PREFIXES = [
  "est-",
  "quot-",
  "inv-",
  "po-",
  "exp-",
  "veh-",
  "cust-",
  "prod-",
  "tm-",
  "fy-",
  "notif-",
] as const;

/** True when `id` is a client-minted optimistic id, not a persisted row. */
export function isTemporaryId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0) return false;
  return TEMPORARY_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * True when `id` is safe to send to an endpoint that expects a persisted
 * database id. Deliberately permissive: it rejects only the known optimistic
 * prefixes, so a real id is never refused for being short or unusual.
 */
export function isPersistedId(id: unknown): id is string {
  if (typeof id !== "string" || id.trim().length === 0) return false;
  return !isTemporaryId(id);
}
