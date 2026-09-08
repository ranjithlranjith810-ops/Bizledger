// Phase 4A plan catalog seed — safe & idempotent.
//
// Usage (from bizledger-master):
//   npx prisma db seed
//
// Populates plan_catalog with the authoritative PLAN_CATALOG rows
// (base | business | enterprise) via upsert. Running it twice creates no
// duplicates and never touches subscription/payment history.
//
// NOTE: dotenv is configured BEFORE the plan-service module (which reads
// DATABASE_URL) is loaded, so a dynamic import is required here.

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { syncPlanCatalog } = await import("../src/lib/billing/plan-service");
  const result = await syncPlanCatalog();
  console.log(
    `plan_catalog seeded: ${result.synced} plans synced -> ${result.plans.join(", ")}`
  );
}

main().catch((error) => {
  console.error("Plan seed failed:", error);
  process.exit(1);
});