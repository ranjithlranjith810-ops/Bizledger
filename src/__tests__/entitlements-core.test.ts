// Phase 9C-4 — pure entitlement-core unit tests (limits, feature registry,
// invoice window, safe custom-plan limit resolution, and fake-db gate).
//
// Run with:
//   $env:NODE_OPTIONS="--conditions=react-server"
//   npx tsx src/__tests__/entitlements-core.test.ts

import {
  assertWithinLimit,
  countUsage,
  featuresFromCatalogRow,
  getFeatureLimit,
  hasFeature,
  planFromCatalogRow,
} from "@/lib/billing/entitlements-server";
import type {
  CatalogPlanRow,
  EntitlementDb,
  EntitlementKind,
  FeatureEntitlements,
} from "@/lib/billing/entitlements-server";
import type { SubscriptionPlan } from "@/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; failures.push(label); console.log(`FAIL  ${label}${detail ? ` ${detail}` : ""}`); }
}

function catRow(overrides: Partial<CatalogPlanRow>): CatalogPlanRow {
  return {
    id: "plan_custom",
    name: "Custom",
    period: "month",
    businessNetworkIncluded: false,
    limits: { customers: 4, teamMembers: 2, products: 8, invoicesPerMonth: 6, directoryListings: 1 },
    featureEntitlements: null,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// 1. hasFeature / getFeatureLimit
// -----------------------------------------------------------------------
function testFeatures() {
  check("F1  registered false  → denied",    hasFeature({ quotations: false }, "quotations") === false);
  check("F2  registered 0     → denied",    hasFeature({ quotations: 0 }, "quotations") === false);
  check("F3  registered true  → allowed",   hasFeature({ quotations: true }, "quotations") === true);
  check("F4  registered 1     → allowed",   hasFeature({ quotations: 1 }, "quotations") === true);
  check("F5  Unlimited        → allowed",   hasFeature({ quotations: "Unlimited" }, "quotations") === true);
  check("F6  absent           → allowed",   hasFeature({}, "quotations") === true);
  check("F7  unknown key      → no grant",  hasFeature({ magical: true }, "quotations") === true);
  check("F8  unknown key can't override",   hasFeature({ quotations: false, magical: true }, "quotations") === false);
  check("F9  getFeatureLimit returns value",  getFeatureLimit({ quotations: 5 }, "quotations") === 5);
  check("F10 getFeatureLimit absent → null",  getFeatureLimit({}, "quotations") === null);
}

// -----------------------------------------------------------------------
// 2. featuresFromCatalogRow
// -----------------------------------------------------------------------
function testFeaturesFromRow() {
  const valid = featuresFromCatalogRow(catRow({
    featureEntitlements: { q: true, n: 1, u: "Unlimited", bad: -1, no: "yes" },
  }));
  check("F11 valid entries kept",           valid["q"] === true && valid["n"] === 1 && valid["u"] === "Unlimited");
  check("F12 invalid entries dropped",     valid["bad"] === undefined && valid["no"] === undefined);
  check("F13 null → {}",                  Object.keys(featuresFromCatalogRow(catRow({ featureEntitlements: null }))).length === 0);
  check("F14 array → {}",                 Object.keys(featuresFromCatalogRow(catRow({ featureEntitlements: [] }))).length === 0);
}

// -----------------------------------------------------------------------
// 3. planFromCatalogRow safe-limit resolution
// -----------------------------------------------------------------------
function testPlanFromRow() {
  const custom = planFromCatalogRow(catRow({
    limits: { customers: 3, products: "Unlimited" },
  }));
  check("L1 custom plan limits preserved",   custom.plan.limits.customers === 3 && custom.plan.limits.products === "Unlimited");
  check("L2 custom missing key → 0 (never Unlimited)",
    custom.plan.limits.invoicesPerMonth === 0 && custom.plan.limits.directoryListings === 0);

  const malformed = planFromCatalogRow(catRow({ limits: { customers: 10, products: "all" } }));
  check("L3 malformed value → 0",             malformed.plan.limits.products === 0);

  const base = planFromCatalogRow(catRow({ id: "base", limits: {} }));
  check("L4 canonical base fallback to static", base.plan.limits.customers === 2 && base.plan.limits.teamMembers === 0);

  const biz = planFromCatalogRow(catRow({ id: "business", limits: { invoicesPerMonth: "Unlimited" } }));
  check("L5 business canonical keeps DB Unlimited + fallback rest",
    biz.plan.limits.invoicesPerMonth === "Unlimited" && biz.plan.limits.customers === 150 && biz.plan.limits.teamMembers === 3);
}

// -----------------------------------------------------------------------
// 4. assertWithinLimit pure helper
// -----------------------------------------------------------------------
function testAssertWithinLimit() {
  const p = planFromCatalogRow(catRow({})).plan;

  const unlimited = testWithin(p, "invoices", "Unlimited", 999);
  check("T1 Unlimited → allowed", unlimited.allowed === true);

  const under = testWithin(p, "customers", 5, 3);
  check("T2 under → allowed, remaining=1",  under.allowed === true && under.remaining === 1);

  const exact = testWithin(p, "customers", 5, 5);
  check("T3 exact → throws EntitlementDeniedError",
    exact.threw === true && exact.errorKind === "customers" && exact.errorLimit === 5 && exact.errorUsed === 5);

  const over = testWithin(p, "products", 3, 8);
  check("T4 over → throws", over.threw === true && over.errorLimit === 3);
}
function testWithin(plan: SubscriptionPlan, kind: EntitlementKind, limit: number | "Unlimited", used: number) {
  try {
    const decision = assertWithinLimit(plan, kind, limit, used);
    return { threw: false, allowed: decision.allowed, remaining: decision.remaining };
  } catch (e: unknown) {
    const err = e as { kind?: unknown; limit?: unknown; used?: unknown };
    return { threw: true, errorKind: err.kind, errorLimit: err.limit, errorUsed: err.used, allowed: false, remaining: 0 };
  }
}

// -----------------------------------------------------------------------
// 5. countUsage fake-db: invoice month-window where clause
// -----------------------------------------------------------------------
type InvoiceWhere = {
  businessId?: string;
  status?: { not?: string };
  createdAt?: { gte?: Date; lt?: Date };
};

// Fake for `$queryRaw` (the business row-lock used by assertFeature): the lock
// is awaited by the guard but its result is ignored, so it returns undefined.
const QUERY_RAW_UNUSED: EntitlementDb["$queryRaw"] = async <_T = unknown>(
  _strings: TemplateStringsArray,
  ..._values: unknown[]
) => undefined as unknown as _T;

async function testInvoiceWindow() {
  // Property holder (not a flow-analyzed `let`) so TS keeps the declared
  // `InvoiceWhere | null` type across the deferred async closure write.
  const probe: { where: InvoiceWhere | null } = { where: null };
  const fakeDb: EntitlementDb = {
    $queryRaw: QUERY_RAW_UNUSED,
    businessSubscription: { findFirst: async () => ({ planId: "base", period: "month", renewsAt: new Date(Date.now() + 30*86400000) }) },
    planCatalog: { findFirst: async () => null },
    customer: { count: async () => 0 },
    product: { count: async () => 0 },
    businessMember: { count: async () => 0 },
    businessDirectoryProfile: { count: async () => 0 },
    invoice: {
      count: async (args: unknown) => {
        const where = (args as { where?: InvoiceWhere }).where;
        probe.where = where ?? null;
        return 0;
      },
    },
  };
  await countUsage(fakeDb, "bizX", "invoices", "month");
  const w = probe.where;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  check("W1 invoice where gte = monthStart",       w?.createdAt?.gte?.getTime() === monthStart.getTime(), JSON.stringify(w?.createdAt));
  check("W2 invoice where lt  = monthEnd",          w?.createdAt?.lt?.getTime()  === monthEnd.getTime());
  check("W3 invoice where status not Cancelled",    w?.status?.not === "Cancelled");
  check("W4 invoice where businessId set",          w?.businessId === "bizX");
}

// -----------------------------------------------------------------------
// 6. assertFeature with fake db
// -----------------------------------------------------------------------
function errorName(e: unknown): string {
  const name =
    typeof e === "object" && e !== null ? (e as { name?: unknown }).name : undefined;
  return typeof name === "string" ? name : "";
}

function errorDetail(e: unknown): string {
  const obj = (typeof e === "object" && e !== null ? e : {}) as {
    name?: unknown;
    message?: unknown;
  };
  const name = typeof obj.name === "string" ? obj.name : "";
  const message = typeof obj.message === "string" ? obj.message : "";
  return message ? `${name}: ${message}` : name;
}

async function testAssertFeature() {
  const makeDb = (fe: FeatureEntitlements | null): EntitlementDb => ({
    $queryRaw: QUERY_RAW_UNUSED,
    businessSubscription: { findFirst: async () => ({ planId: "p1", period: "month", renewsAt: new Date(Date.now() + 86400000) }) },
    planCatalog: { findFirst: async () => catRow({ id: "p1", featureEntitlements: fe }) },
    customer: { count: async () => 0 }, product: { count: async () => 0 },
    businessMember: { count: async () => 0 }, businessDirectoryProfile: { count: async () => 0 },
    invoice: { count: async () => 0 },
  });

  const { assertFeature } = await import("@/lib/billing/entitlements-server");

  let threw = "";
  try { await assertFeature(makeDb({ quotations: true }), "b", "quotations"); } catch (e: unknown) { threw = errorName(e); }
  check("FE1 quotations true  → no throw", threw === "");

  try { await assertFeature(makeDb({ quotations: false }), "b", "quotations"); } catch (e: unknown) { threw = errorName(e); }
  check("FE2 quotations false → FeatureDeniedError", threw === "FeatureDeniedError");

  threw = "";
  try { await assertFeature(makeDb(null), "b", "quotations"); } catch (e: unknown) { threw = errorDetail(e); }
  check("FE3 absent           → no throw (backward compat)", threw === "", threw);

  threw = "";
  try { await assertFeature(makeDb({ quotations: false, magical: true }), "b", "quotations"); } catch (e: unknown) { threw = errorName(e); }
  check("FE4 unknown key can't override false", threw === "FeatureDeniedError");
}

// -----------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------
async function main() {
  testFeatures();
  testFeaturesFromRow();
  testPlanFromRow();
  testAssertWithinLimit();
  await testInvoiceWindow();
  await testAssertFeature();

  console.log(`\nENTITLEMENTS-CORE UNIT: ${passed} passed, ${failed} failed`);
  if (failures.length) { console.log("failures:", failures.join("\n  ")); process.exit(1); }
}

main().catch((e) => { console.error("FATAL", e?.stack ?? e); process.exit(1); });