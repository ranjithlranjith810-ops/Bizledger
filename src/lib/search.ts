/**
 * Shared client-side search helper for list views.
 *
 * - Case-insensitive
 * - Partial substring matches
 * - Trims leading/trailing whitespace on both the query and each field
 * - Safe against null/undefined field values
 * - An empty/whitespace-only query matches everything (restores the full list)
 *
 * This centralizes the duplicated `.toLowerCase().includes()` logic that list
 * views previously inlined per page.
 */

export type SearchableFieldValue =
  | string
  | number
  | null
  | undefined;

export function normalizeForSearch(value: SearchableFieldValue): string {
  return value == null ? "" : String(value).trim().toLowerCase();
}

export function normalizeQuery(query: string): string {
  return (query ?? "").trim().toLowerCase();
}

/**
 * Returns true when `record` matches `query` against any of the given fields.
 * An empty query matches every record.
 */
export function matchesSearch(
  query: string,
  fields: Array<SearchableFieldValue>
): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  return fields.some((f) => normalizeForSearch(f).includes(q));
}