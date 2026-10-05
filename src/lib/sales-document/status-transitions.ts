// AUTHORITATIVE STATUS TRANSITION MATRIX
//
// Deliberately dependency-free so it can be imported by BOTH the server
// services and the client components without dragging server-only code
// (prisma, the GST engine, api-error) into the browser bundle.
//
// The status LISTS below already existed in the repository (Prisma enums
// EstimateStatus / QuotationStatus, and the validated six-value string
// allowlist for PurchaseOrder, whose schema comment states exactly
// "Draft | Sent | Accepted | Partially Received | Received | Cancelled").
//
// What the repository did NOT have is the LIFECYCLE: there was no server rule
// for how these statuses may change, so the UI changed status with a local
// setState and could display a status that was never persisted.
//
// The edges below MIRROR the Invoice matrix already in the repository
// (INVOICE_STATUS_TRANSITIONS in src/lib/invoice/invoice-service.ts), which is
// the reference implementation for this codebase:
//   * forward moves only;
//   * no edge back to Draft;
//   * no edge out of a terminal state;
//   * the client requests a destination, the server decides legality.
//
// This is NOT a new product policy. Every status named here already existed,
// and each terminal outcome is the close-out the existing code and comments
// already described as the alternative to deleting a document.
//
// UI USE: the status dropdowns render `next*Statuses(currentStatus)`, so an
// illegal target is never offered. That is UX only and NOT a security
// boundary — every transition is independently validated server-side against
// the document's CURRENT status read from the database.

export const QUOTATION_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
] as const;
export type QuotationStatusT = (typeof QUOTATION_STATUSES)[number];

export const ESTIMATE_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
] as const;
export type EstimateStatusT = (typeof ESTIMATE_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "Draft",
  "Sent",
  "Accepted",
  "Partially Received",
  "Received",
  "Cancelled",
] as const;
export type PoStatusT = (typeof PURCHASE_ORDER_STATUSES)[number];

export const QUOTATION_STATUS_TRANSITIONS: Record<
  QuotationStatusT,
  readonly QuotationStatusT[]
> = {
  Draft: ["Sent"],
  Sent: ["Accepted", "Rejected", "Expired"],
  Accepted: [],
  Rejected: [],
  Expired: [],
};

export const ESTIMATE_STATUS_TRANSITIONS: Record<
  EstimateStatusT,
  readonly EstimateStatusT[]
> = {
  Draft: ["Sent"],
  Sent: ["Accepted", "Rejected", "Expired"],
  Accepted: [],
  Rejected: [],
  Expired: [],
};

export const PURCHASE_ORDER_STATUS_TRANSITIONS: Record<
  PoStatusT,
  readonly PoStatusT[]
> = {
  Draft: ["Sent"],
  // Mirrors Invoice: one forward edge (Draft -> Sent), then every later status
  // is a legal Existence status and nothing further (all others terminal).
  // No "receiving progression" edges exist — Accepted and Partially Received
  // are terminal, matching the approved "all others terminal" policy.
  Sent: ["Accepted", "Partially Received", "Received", "Cancelled"],
  Accepted: [],
  "Partially Received": [],
  Received: [],
  Cancelled: [],
};

// The Invoice matrix is the reference implementation the three matrices above
// mirror. It lives here (not redefined) so the Invoice status select and
// transitionInvoiceStatus read ONE definition and cannot drift. The values are
// exactly the pre-existing INVOICE_STATUS_TRANSITIONS — nothing is changed.
export const INVOICE_STATUSES = [
  "Draft",
  "Pending",
  "Overdue",
  "Paid",
  "Cancelled",
] as const;
export type InvoiceStatusT = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatusT,
  readonly InvoiceStatusT[]
> = {
  Draft: ["Pending"],
  Pending: ["Paid", "Overdue", "Cancelled"],
  Overdue: ["Paid", "Pending", "Cancelled"],
  Paid: [],
  Cancelled: [],
};

/** Statuses the document may legally move to right now. Empty = terminal. */
export function nextQuotationStatuses(current: string): readonly string[] {
  return (
    QUOTATION_STATUS_TRANSITIONS[current as QuotationStatusT] ?? []
  ) as readonly string[];
}

export function nextEstimateStatuses(current: string): readonly string[] {
  return (
    ESTIMATE_STATUS_TRANSITIONS[current as EstimateStatusT] ?? []
  ) as readonly string[];
}

export function nextPurchaseOrderStatuses(current: string): readonly string[] {
  return (
    PURCHASE_ORDER_STATUS_TRANSITIONS[current as PoStatusT] ?? []
  ) as readonly string[];
}

export function nextInvoiceStatuses(current: string): readonly string[] {
  return (
    INVOICE_STATUS_TRANSITIONS[current as InvoiceStatusT] ?? []
  ) as readonly string[];
}

/**
 * True when `target` is a legal successor of `current` in the given matrix.
 * The server calls this with the status read from the database, never with a
 * status supplied by the client.
 */
export function isLegalTransition(
  matrix: Record<string, readonly string[]>,
  current: string,
  target: string,
): boolean {
  return (matrix[current] ?? []).includes(target);
}

/** True when no further transition exists from `current`. */
export function isTerminalStatus(
  matrix: Record<string, readonly string[]>,
  current: string,
): boolean {
  return (matrix[current] ?? []).length === 0;
}
