// ---------------------------------------------------------------------------
// FINANCIAL-YEAR core (single source of truth).
//
// India financial year = 1 April YYYY -> 31 March YYYY+1 (e.g. 1 Apr 2026
// -> "2026-27"). Every module that needs an FY (invoices, quotations,
// estimates, POs, dashboards, admin) must go through this module so the rule
// is defined exactly once.
//
// The reconciliation rule (idempotent, forward-only rollover):
//   1. Compute the FY that *contains today* ("current FY"). Create it if the
//      account has no matching FY (auto-provision, idempotent).
//   2. If the currently-active FY does NOT contain today AND today is AFTER
//      the active FY's start (i.e. the active FY is genuinely in the past),
//      roll the active FY forward to the FY containing today. This prevents
//      minting document numbers in a closed year (the 31 Mar -> 1 Apr edge).
//   3. Selecting a FUTURE FY (today before its start) or the current FY is
//      respected — never auto-reverted. Only an active FY that has ENDED
//      triggers rollover.
// ---------------------------------------------------------------------------

import {
  FinancialYearSettings,
  PerFySequences,
  SequenceKind,
} from "@/types";

// Numeric date key (y*10000 + m*100 + d) for gap-free date-only comparisons.
// Uses UTC getters so the UTC-stored FY boundaries (start = 1 Apr 00:00 UTC,
// end = 31 Mar 23:59 UTC) compare against "today" on the same calendar day
// regardless of the machine's local timezone — otherwise, in any timezone east
// of UTC, the 23:59 UTC end-of-year instant would shift into the next local day
// and the 31-Mar-23:59 -> 1-Apr rollover would fire a day late (or never).
function dateKey(date: Date): number {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}
function isoKey(iso: string): number {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : dateKey(d);
}
export function todayKey(refDate: Date = new Date()): number {
  return dateKey(refDate);
}

// The India FY a given date belongs to, as a full FinancialYearSettings with a
// deterministic id ("fy-2026-2027"). startDate = 1 Apr (UTC), endDate = 31 Mar
// 23:59 (UTC). Name matches the legacy default ("Financial Year 2026-27").
// Computed from the UTC calendar date to stay consistent with the UTC-stored
// boundaries (identical to financialYearForDate's local behavior except within
// one hour of the month boundary in positive-offset timezones).
export function financialYearForDate(refDate: Date = new Date()): FinancialYearSettings {
  const y = refDate.getUTCFullYear();
  const startYear = refDate.getUTCMonth() >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  const startDate = new Date(Date.UTC(startYear, 3, 1)).toISOString();
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59)).toISOString();
  return {
    id: `fy-${startYear}-${endYear}`,
    name: `Financial Year ${startYear}-${String(endYear).slice(2)}`,
    startDate,
    endDate,
  };
}

// Equality: an existing FY "matches" today's current FY when they cover the
// same date range (id match OR identical start/end dates OR the FY contains
// today). Returns the matching FY or undefined.
export function matchFinancialYear(
  years: FinancialYearSettings[],
  current: FinancialYearSettings
): FinancialYearSettings | undefined {
  const cStart = isoKey(current.startDate);
  const cEnd = isoKey(current.endDate);
  return years.find((fy) => fy.id === current.id || (isoKey(fy.startDate) === cStart && isoKey(fy.endDate) === cEnd));
}

// Pure reconciliation. Returns the reconciled year list + the FY id that should
// be active for refDate, plus flags describing what happened (so the caller can
// fire a rollover notification).
export interface RolloverResult {
  years: FinancialYearSettings[];
  activeId: string | null;
  target: FinancialYearSettings | undefined; // FY the caller should activate
  created: boolean; // a missing current FY was auto-provisioned
  rolledOver: boolean; // the active FY moved forward (old ended, new activated)
  previousActiveId: string | null;
  current: FinancialYearSettings; // the current FY for refDate
}

export function reconcileFinancialYears(
  years: FinancialYearSettings[],
  activeId: string | null,
  refDate: Date = new Date()
): RolloverResult {
  const current = financialYearForDate(refDate);
  const curated = [...years];
  const currentKey = todayKey(refDate);

  // 1. Auto-provision the current FY if missing (idempotent).
  const existing = matchFinancialYear(curated, current);
  if (!existing) {
    curated.push(current);
  }
  const targetFy = existing ?? current;

  // 2. Determine whether the currently-active FY must roll forward.
  const active = activeId ? curated.find((fy) => fy.id === activeId) : undefined;
  const previousActiveId = activeId ?? null;
  let nextActiveId: string | null = activeId ?? null;
  let rolledOver = false;

  if (active) {
    const aStart = isoKey(active.startDate);
    const aEnd = isoKey(active.endDate);
    // Only roll forward when the active FY is in the past relative to today:
    // today is not within [start, end] and today is after its start.
    const activeEnded = currentKey > aEnd;
    const activeOngoing = currentKey >= aStart && currentKey <= aEnd;
    if (activeEnded || (!activeOngoing && currentKey > aStart)) {
      nextActiveId = targetFy.id;
      rolledOver = nextActiveId !== previousActiveId;
    }
  } else if (curated.length) {
    // No active FY persisted: default to the FY containing today.
    nextActiveId = targetFy.id;
  }

  return {
    years: curated,
    activeId: nextActiveId,
    target: targetFy,
    created: !existing,
    rolledOver,
    previousActiveId,
    current,
  };
}

// Fallback when there are no years at all: a single default current FY.
export function defaultFinancialYear(): FinancialYearSettings {
  return financialYearForDate(new Date());
}

// Convenience: name of an FY by id within a year list.
export function financialYearName(years: FinancialYearSettings[], id: string | null | undefined): string {
  if (!id) return "";
  const fy = years.find((y) => y.id === id);
  return fy ? fy.name : "";
}

// ---------------------------------------------------------------------------
// Per-FY document sequence maps.
// Sequences are keyed by FY id so each year has an independent counter
// (historical numbers never change; a new year always starts at 1).
// ---------------------------------------------------------------------------
export function emptyPerFySequences(): PerFySequences {
  return { invoice: 1, quotation: 1, estimate: 1, purchaseOrder: 1 };
}

// Read the next sequence number for a given FY + kind (1 when unknown).
export function getSequence(
  map: Record<string, Partial<PerFySequences> | undefined>,
  fyId: string | null | undefined,
  kind: SequenceKind
): number {
  if (!fyId) return 1;
  return map[fyId]?.[kind] ?? 1;
}

// Return a new map with `kind` advanced by one for `fyId`. The numeric VALUE
// that should be used for the document is the PRE-increment number, returned
// as `value` so callers can mint the number atomically with the increment.
export function nextSequence(
  map: Record<string, Partial<PerFySequences> | undefined>,
  fyId: string | null | undefined,
  kind: SequenceKind
): { map: Record<string, Partial<PerFySequences>>; value: number } {
  if (!fyId) {
    const copy: Record<string, Partial<PerFySequences>> = {};
    for (const [k, v] of Object.entries(map)) {
      if (v) copy[k] = v;
    }
    return { map: copy, value: 1 };
  }
  const entry = { ...emptyPerFySequences(), ...(map[fyId] ?? {}) };
  const value = entry[kind] ?? 1;
  const nextEntry = { ...entry, [kind]: value + 1 };
  const copy: Record<string, Partial<PerFySequences>> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v) copy[k] = v;
  }
  copy[fyId] = nextEntry;
  return { map: copy, value };
}

// Sequence storage key (kept account-scoped by the caller via dataKey).
export const SEQUENCES_KEY = "doc_sequences";

// Re-export the shared sequence types so consumers can import them from the
// financial-year module (single source of truth) rather than from @/types.
export type { PerFySequences, SequenceKind } from "@/types";