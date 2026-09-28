// Shared calendar-date helpers.
//
// Financial document dates are BUSINESS calendar dates (YYYY-MM-DD): they
// represent the day the document was recorded, not an instant. The server
// stores them as UTC dates and compares them with the UTC date-key convention
// (see src/lib/financialYear.ts). These helpers build the LOCAL calendar date
// so a default Document date does not drift by one day in positive-offset
// timezones (an Indian morning is still the previous date in UTC, so
// `new Date().toISOString().split("T")[0]` would prefill yesterday).

export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse a YYYY-MM-DD into a local-calendar Date (midnight local); day-arithmetic
// then stays on the local calendar day.
export function parseLocalDate(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() + 1 !== month ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

// Add a number of calendar days to a YYYY-MM-DD (local calendar), e.g. for a
// quotation/estimate "valid until" default of +30 days.
export function addDaysLocal(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return localDateString(d);
}