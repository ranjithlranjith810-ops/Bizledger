// Phase 9C-4 — `businessDirectory` feature-entitlement semantics and the
// directory submission gate that consumes them.
//
// Run with (entitlements-server.ts is a `server-only` module):
//   $env:NODE_OPTIONS="--conditions=react-server"
//   npx tsx src/__tests__/directory-feature-entitlement.test.ts
//
// WHY THIS FILE EXISTS (regression guard for a real incident):
//
//   commit d7dad75 "fix(directory): gate submission on businessDirectory
//   feature" imported `FeatureDeniedError` + `hasFeature` from
//   entitlements-server and destructured `features` off `resolveEffectivePlan`,
//   but none of those three symbols had EVER been committed — they existed only
//   in uncommitted worktree changes. The committed tree therefore failed to
//   typecheck:
//
//     directory-service.ts(36,3): TS2305: no exported member 'FeatureDeniedError'
//     directory-service.ts(37,3): TS2305: no exported member 'hasFeature'
//     directory-service.ts(512,19): TS2339: Property 'features' does not exist
//
//   ...while `directory-production-safety.test.ts` still reported 27/27 PASS,
//   because it asserts on source TEXT via readFileSync and never imports the
//   service or the entitlements module. A green suite therefore said nothing
//   about whether the committed code could build or run.
//
//   The tests below import the REAL modules, so a missing export, a changed
//   default, or a flipped semantic fails here instead of passing silently.
//
// SEMANTIC CONTRACT pinned by these tests (9C-4):
//
//   ABSENT / unspecified -> preserve existing behaviour (allowed)
//   EXPLICITLY disabled  -> deny directory submission
//                          (false, 0)
//   EXPLICITLY enabled   -> allow, subject to the existing numeric
//                          directoryListing cap
//
//   In particular: absent MUST NOT be treated as disabled, and an explicit
//   disable MUST be distinguishable from absence.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FeatureDeniedError,
  REGISTERED_FEATURES,
  featuresFromCatalogRow,
  getFeatureLimit,
  hasFeature,
  resolveEffectivePlan,
} from "@/lib/billing/entitlements-server";
import { EntitlementDeniedError } from "@/lib/billing/entitlements-server";
import { getLimitFor } from "@/lib/plans";
import type {
  CatalogPlanRow,
  EntitlementDb,
  FeatureEntitlements,
} from "@/lib/billing/entitlements-server";

const REPO_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const SERVICE = "src/lib/directory/directory-service.ts";

const UNUSED_QUERY_RAW = (() => {
  throw new Error("$queryRaw must not run in this pure-logic test");
}) as unknown as EntitlementDb["$queryRaw"];

function catRow(overrides: Partial<CatalogPlanRow> = {}): CatalogPlanRow {
  return {
    id: "plan_directory_test",
    name: "Directory Gate Test Plan",
    period: "month",
    businessNetworkIncluded: false,
    // A positive directoryListings cap, so the FEATURE off-switch is what is
    // under test rather than the numeric limit.
    limits: { directoryListings: 5 },
    featureEntitlements: null,
    ...overrides,
  };
}

/** Fake EntitlementDb whose effective plan carries `featureEntitlements`. */
function dbWithFeatures(features: FeatureEntitlements | null): EntitlementDb {
  return {
    $queryRaw: UNUSED_QUERY_RAW,
    businessSubscription: {
      findFirst: async () => ({
        planId: "plan_directory_test",
        period: "month",
        renewsAt: new Date(Date.now() + 86_400_000), // not expired
      }),
    },
    planCatalog: {
      findFirst: async () => catRow({ featureEntitlements: features }),
    },
    customer: { count: async () => 0 },
    product: { count: async () => 0 },
    businessMember: { count: async () => 0 },
    invoice: { count: async () => 0 },
    businessDirectoryProfile: { count: async () => 0 },
  };
}

/**
 * Faithful replica of the gate inside `submitMyDirectoryProfile`, using the
 * same imported helpers the service uses and in the same order. `db` is the
 * transaction handle; the service passes its own `tx` here.
 */
async function runSubmitGate(
  db: EntitlementDb,
  existingStatus: "NOT_LISTED" | "PENDING_REVIEW" | "PUBLISHED" = "NOT_LISTED",
): Promise<{ denied: boolean; error?: unknown }> {
  const businessId = "business_directory_test";
  const { plan, features } = await resolveEffectivePlan(db, businessId);

  const limit = getLimitFor(plan, "directoryListing");
  const cap = typeof limit === "number" ? limit : null;
  if (
    cap === 0 &&
    existingStatus !== "PENDING_REVIEW" &&
    existingStatus !== "PUBLISHED"
  ) {
    return { denied: true, error: new EntitlementDeniedError("directoryListing", 0, 0) };
  }
  if (!hasFeature(features, "businessDirectory")) {
    return { denied: true, error: new FeatureDeniedError("businessDirectory") };
  }
  return { denied: false };
}

// ---------------------------------------------------------------------------
// 1. Import surface — the guard that would have caught the d7dad75 break
// ---------------------------------------------------------------------------
describe("9C-4: the symbols the directory gate imports actually exist", () => {
  it("FeatureDeniedError is an exported Error subclass carrying `feature`", () => {
    assert.equal(typeof FeatureDeniedError, "function");
    const err = new FeatureDeniedError("businessDirectory");
    assert.ok(err instanceof Error);
    assert.equal(err.name, "FeatureDeniedError");
    assert.equal((err as { feature?: string }).feature, "businessDirectory");
  });

  it("hasFeature is an exported function", () => {
    assert.equal(typeof hasFeature, "function");
  });

  it("featuresFromCatalogRow is an exported function", () => {
    assert.equal(typeof featuresFromCatalogRow, "function");
  });

  it("resolveEffectivePlan resolves features off the effective plan", async () => {
    assert.equal(typeof resolveEffectivePlan, "function");
    const { plan, features } = await resolveEffectivePlan(
      dbWithFeatures({ businessDirectory: false }),
      "business_directory_test",
    );
    assert.ok(plan, "effective plan must resolve");
    assert.deepEqual(features, { businessDirectory: false });
  });

  it("the directory service actually consumes these symbols", () => {
    const src = read(SERVICE);
    assert.match(src, /hasFeature/);
    assert.match(src, /FeatureDeniedError/);
    assert.match(src, /resolveEffectivePlan/);
  });
});

// ---------------------------------------------------------------------------
// 2. Registry
// ---------------------------------------------------------------------------
describe("9C-4: businessDirectory is a registered feature", () => {
  it("is listed in REGISTERED_FEATURES", () => {
    assert.ok(
      REGISTERED_FEATURES.includes("businessDirectory"),
      "businessDirectory must be registered or the off-switch can never be honoured",
    );
  });

  it("keeps the pre-existing quotations registration", () => {
    assert.ok(REGISTERED_FEATURES.includes("quotations"));
  });
});

// ---------------------------------------------------------------------------
// 3. Semantics: absent vs explicitly disabled vs explicitly enabled
// ---------------------------------------------------------------------------
describe("9C-4: absent is NOT the same as explicitly disabled", () => {
  it("absent -> allowed (default behaviour preserved)", () => {
    assert.equal(hasFeature({}, "businessDirectory"), true);
  });

  it("explicit false -> denied", () => {
    assert.equal(hasFeature({ businessDirectory: false }, "businessDirectory"), false);
  });

  it("explicit 0 -> denied", () => {
    assert.equal(hasFeature({ businessDirectory: 0 }, "businessDirectory"), false);
  });

  it("explicit true -> allowed", () => {
    assert.equal(hasFeature({ businessDirectory: true }, "businessDirectory"), true);
  });

  it("explicit 1 -> allowed", () => {
    assert.equal(hasFeature({ businessDirectory: 1 }, "businessDirectory"), true);
  });

  it('"Unlimited" -> allowed', () => {
    assert.equal(
      hasFeature({ businessDirectory: "Unlimited" }, "businessDirectory"),
      true,
    );
  });

  it("null -> allowed (pure predicate only; normalization drops null)", () => {
    // A stored `null` is stripped by `featuresFromCatalogRow` (see the
    // normalization suite below), so this state is unreachable from a plan row.
    // The cast documents that the raw predicate is still fail-open on null
    // rather than accidentally denying.
    const raw = { businessDirectory: null } as unknown as FeatureEntitlements;
    assert.equal(hasFeature(raw, "businessDirectory"), true);
  });

  it("absent and explicit false are distinguishable", () => {
    assert.notEqual(
      hasFeature({}, "businessDirectory"),
      hasFeature({ businessDirectory: false }, "businessDirectory"),
    );
  });

  it("getFeatureLimit reports null when unspecified, false/0 when disabled", () => {
    assert.equal(getFeatureLimit({}, "businessDirectory"), null);
    assert.equal(getFeatureLimit({ businessDirectory: false }, "businessDirectory"), false);
    assert.equal(getFeatureLimit({ businessDirectory: 0 }, "businessDirectory"), 0);
    assert.equal(getFeatureLimit({ businessDirectory: true }, "businessDirectory"), true);
  });
});

// ---------------------------------------------------------------------------
// 4. DB-row normalization: what a stored plan row means
// ---------------------------------------------------------------------------
describe("9C-4: stored plan rows normalize without inventing a default", () => {
  it("SQL NULL featureEntitlements -> empty map -> allowed", () => {
    const f = featuresFromCatalogRow(catRow({ featureEntitlements: null }));
    assert.deepEqual(f, {});
    assert.equal(hasFeature(f, "businessDirectory"), true);
  });

  it("an empty JSON object -> empty map -> allowed", () => {
    const f = featuresFromCatalogRow(catRow({ featureEntitlements: {} }));
    assert.deepEqual(f, {});
    assert.equal(hasFeature(f, "businessDirectory"), true);
  });

  it("an explicit false survives normalization and still denies", () => {
    const f = featuresFromCatalogRow(
      catRow({ featureEntitlements: { businessDirectory: false } }),
    );
    assert.deepEqual(f, { businessDirectory: false });
    assert.equal(hasFeature(f, "businessDirectory"), false);
  });

  it("an explicit 0 survives normalization and still denies", () => {
    const f = featuresFromCatalogRow(
      catRow({ featureEntitlements: { businessDirectory: 0 } }),
    );
    assert.deepEqual(f, { businessDirectory: 0 });
    assert.equal(hasFeature(f, "businessDirectory"), false);
  });

  it("an unrecognised value is dropped rather than silently disabling", () => {
    const f = featuresFromCatalogRow(
      catRow({ featureEntitlements: { businessDirectory: "yes" } }),
    );
    assert.deepEqual(f, {});
    assert.equal(hasFeature(f, "businessDirectory"), true);
  });
});

// ---------------------------------------------------------------------------
// 5. The actual directory submission gate
// ---------------------------------------------------------------------------
describe("9C-4: directory submission gate honours the off-switch", () => {
  it("plan does not mention the feature -> submission is allowed", async () => {
    const { denied } = await runSubmitGate(dbWithFeatures(null));
    assert.equal(denied, false);
  });

  it("plan explicitly disables it -> FeatureDeniedError", async () => {
    const { denied, error } = await runSubmitGate(
      dbWithFeatures({ businessDirectory: false }),
    );
    assert.equal(denied, true);
    assert.ok(error instanceof FeatureDeniedError);
    assert.equal((error as { feature?: string }).feature, "businessDirectory");
  });

  it("plan sets it to 0 -> FeatureDeniedError", async () => {
    const { denied, error } = await runSubmitGate(
      dbWithFeatures({ businessDirectory: 0 }),
    );
    assert.equal(denied, true);
    assert.ok(error instanceof FeatureDeniedError);
  });

  it("plan explicitly enables it -> submission is allowed", async () => {
    const { denied } = await runSubmitGate(
      dbWithFeatures({ businessDirectory: true }),
    );
    assert.equal(denied, false);
  });

  it("the off-switch denies even though the numeric cap is positive", async () => {
    // catWithFeatures sets directoryListings: 5, so only the feature flag can
    // be responsible for the denial.
    const { denied, error } = await runSubmitGate(
      dbWithFeatures({ businessDirectory: false }),
    );
    assert.equal(denied, true);
    assert.equal(error instanceof EntitlementDeniedError, false);
  });

  it("an explicit disable is NOT merely a zero numeric cap", async () => {
    // Distinguishes the two independent denials: a 0 cap raises
    // EntitlementDeniedError (limit), an explicit feature disable raises
    // FeatureDeniedError (off-switch). They must not be conflated.
    const zeroCapDb: EntitlementDb = {
      ...dbWithFeatures({ businessDirectory: true }),
      planCatalog: {
        findFirst: async () => catRow({ limits: { directoryListings: 0 } }),
      },
    };
    const { denied, error } = await runSubmitGate(zeroCapDb);
    assert.equal(denied, true);
    assert.ok(error instanceof EntitlementDeniedError);
    assert.equal(error instanceof FeatureDeniedError, false);
  });
});

// ---------------------------------------------------------------------------
// 6. Pre-existing feature behaviour is unchanged
// ---------------------------------------------------------------------------
describe("9C-4: quotations / advancedReports behaviour is unchanged", () => {
  it("quotations: explicit false still denies", () => {
    assert.equal(hasFeature({ quotations: false }, "quotations"), false);
  });

  it("quotations: explicit 0 still denies", () => {
    assert.equal(hasFeature({ quotations: 0 }, "quotations"), false);
  });

  it("quotations: explicit true / 1 still allow", () => {
    assert.equal(hasFeature({ quotations: true }, "quotations"), true);
    assert.equal(hasFeature({ quotations: 1 }, "quotations"), true);
  });

  it("quotations: absent still allows (backward compatibility)", () => {
    assert.equal(hasFeature({}, "quotations"), true);
  });

  it("quotations: an unrelated key cannot re-enable an explicit disable", () => {
    assert.equal(
      hasFeature({ quotations: false, magical: true }, "quotations"),
      false,
    );
  });

  it("advancedReports is not registered, so it grants no registered behaviour", () => {
    assert.equal(
      REGISTERED_FEATURES.includes("advancedReports" as never),
      false,
    );
    // hasFeature is a pure "explicitly disabled?" predicate and is key-agnostic;
    // only REGISTERED_FEATURES keys carry behaviour, so an unregistered key is
    // never consulted by a caller and cannot change any gate.
    assert.equal(hasFeature({}, "advancedReports"), true);
  });

  it("disabling businessDirectory does not affect quotations", () => {
    const f: FeatureEntitlements = { businessDirectory: false, quotations: true };
    assert.equal(hasFeature(f, "businessDirectory"), false);
    assert.equal(hasFeature(f, "quotations"), true);
  });
});
