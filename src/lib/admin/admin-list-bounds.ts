/**
 * Server-side row bound for admin list/detail queries.
 *
 * Several admin `findMany` calls were unbounded, so a single request had to
 * materialize the entire backing table (all businesses, all subscriptions, all
 * payment records, the whole platform admin log). The response size — and the
 * server memory holding it — therefore grew linearly with lifetime data volume
 * with no ceiling.
 *
 * Scope of the exposure: every one of these endpoints is authenticated
 * (`requirePlatformAdminRole("SUPPORT_ADMIN")`) and read-only, so this is
 * post-authentication availability hardening, NOT a data-exposure or
 * authorization defect. Reaching it already requires valid platform-admin
 * credentials.
 *
 * The cap is intentionally far above any realistic near-term row count for this
 * deployment, so observable behaviour and response shape are unchanged (still
 * an array of the same DTOs). It exists purely to stop an unbounded read.
 *
 * Deliberately NOT applied to `planCatalog`: the plan catalog is a small,
 * inherently bounded reference set, not a growing dataset.
 */
export const ADMIN_LIST_MAX_ROWS = 1000;
