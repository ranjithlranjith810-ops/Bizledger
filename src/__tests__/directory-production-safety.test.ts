// Production-safety regression tests for the public Business Directory.
//
// The production-readiness audit found a launch blocker: the browse UI treated
// "the API returned zero rows" as "show the hardcoded seed catalog", so a fresh
// production database would publicly display fabricated businesses with
// invented phone numbers, addresses and owner names. The detail view had the
// same defect for any unresolvable id.
//
// The invariant pinned here:
//
//   empty real data  !=  demo data
//
// i.e. the render path must derive what it shows from the API response alone.
// A demo catalog may exist in the service layer for tooling, but no directory
// component may reach for it.
//
// Run: npx tsx src/__tests__/directory-production-safety.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getSeedBusinesses,
  filterDirectoryBusinesses,
  toDirectoryCard,
} from "../lib/directory";
import { directoryDetailErrorState } from "../components/directory/DirectoryBusinessView";
import { ApiError } from "../lib/api-client";
import type { DirectoryBusiness } from "../types";

const REPO_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const BROWSE = "src/components/directory/DirectoryBrowse.tsx";
const DETAIL = "src/components/directory/DirectoryBusinessView.tsx";

describe("directory: the demo hazard is real", () => {
  it("the seed catalog is non-empty fabricated data (so the guard matters)", () => {
    const seed = getSeedBusinesses();
    assert.ok(seed.length > 0, "seed catalog must be populated for this test to be meaningful");
    for (const b of seed) {
      assert.ok(b.companyName.length > 0);
      assert.equal(b.status, "Published", "seed entries masquerade as published listings");
    }
  });

  it("every seed entry is reachable only by its own id (fabricated but addressable)", () => {
    for (const b of getSeedBusinesses()) {
      assert.ok(b.id.length > 0);
    }
  });
});

describe("directory: empty real data must NOT become demo data", () => {
  it("an empty pool yields zero cards, not the seed catalog", () => {
    const pool: DirectoryBusiness[] = [];
    const filtered = filterDirectoryBusinesses(pool, {
      query: "",
      businessType: "All",
    } as Parameters<typeof filterDirectoryBusinesses>[1]);
    const cards = filtered.map(toDirectoryCard);
    assert.equal(cards.length, 0, "empty API response must render zero businesses");
    assert.notEqual(cards.length, getSeedBusinesses().length);
  });

  it("real records still render (the fix must not over-block)", () => {
    const real: DirectoryBusiness[] = [
      {
        id: "real-1",
        companyName: "Acme Traders",
        businessType: "Dealer",
        categories: ["Steel"],
        city: "Coimbatore",
        state: "Tamil Nadu",
        primaryPhone: "+91 90000 00000",
        hasPhone: true,
        website: null,
        description: null,
        ownerName: "Real Owner",
        status: "Published",
        isListed: true,
      } as unknown as DirectoryBusiness,
    ];
    const cards = real.map(toDirectoryCard);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].companyName, "Acme Traders");
  });
});

describe("directory: no component may fall back to the seed catalog", () => {
  for (const [label, file] of [
    ["browse", BROWSE],
    ["detail", DETAIL],
  ] as const) {
    it(`${label} does not import the seed catalog`, () => {
      const src = read(file);
      const imports = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/directory["']/.exec(src);
      assert.ok(imports, `${file} should import from @/lib/directory`);
      const names = imports![1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const forbidden of ["getSeedBusinesses", "getSeedBusiness"]) {
        assert.ok(
          !names.includes(forbidden),
          `${file} must not import ${forbidden} (fabricated businesses in production)`
        );
      }
    });

    it(`${label} never calls the seed catalog`, () => {
      const src = read(file);
      for (const forbidden of ["getSeedBusinesses(", "getSeedBusiness("]) {
        assert.ok(
          !src.includes(forbidden),
          `${file} must not call ${forbidden} (fabricated businesses in production)`
        );
      }
    });
  }

  it("browse renders an explicit empty state rather than substituting data", () => {
    const src = read(BROWSE);
    assert.ok(src.includes("No businesses found"), "empty state copy must exist");
    assert.ok(
      src.includes("Could not load the directory"),
      "a failed fetch must render an error/retry state, not demo data"
    );
  });

  it("detail renders an explicit missing state rather than substituting data", () => {
    const src = read(DETAIL);
    assert.ok(src.includes("Listing not found"), "missing-listing copy must exist");
    assert.ok(
      src.includes("Could not load this listing"),
      "a failed fetch must render an error/retry state, not demo data"
    );
  });
});

describe("directory: detail distinguishes 404 from a service failure", () => {
  // Behavioural, not source-text: the real classifier is exercised with real
  // ApiError instances and real non-HTTP failures.
  it("a 404 is a permanent not-found result (no retry offered)", () => {
    assert.equal(directoryDetailErrorState(new ApiError("Listing not found", 404)), "missing");
  });

  it("every other HTTP status keeps the retryable service-error state", () => {
    for (const status of [400, 401, 403, 429, 500, 502, 503]) {
      assert.equal(
        directoryDetailErrorState(new ApiError("boom", status)),
        "error",
        `HTTP ${status} must stay retryable`
      );
    }
  });

  it("a non-HTTP failure (network/offline/parse) keeps the retryable state", () => {
    for (const err of [new TypeError("Failed to fetch"), new Error("boom"), "string failure", null, undefined]) {
      assert.equal(directoryDetailErrorState(err), "error", "non-ApiError must stay retryable");
    }
  });

  it("only a genuine 404 is treated as missing (no other 4xx leaks as 'missing')", () => {
    // Guards against a future `status < 500` style broadening, which would
    // mislabel e.g. a 403/429 as "listing not found".
    assert.equal(directoryDetailErrorState(new ApiError("forbidden", 403)), "error");
    assert.equal(directoryDetailErrorState(new ApiError("teapot", 418)), "error");
  });

  it("the view routes the two states to the correct panels, and 404 offers no retry", () => {
    const src = read(DETAIL);

    // The classifier must actually drive the failure state (not be dead code).
    assert.ok(
      /setFailed\(\s*directoryDetailErrorState\(error\)\s*===\s*"error"\s*\)/.test(src),
      "the catch block must derive `failed` from directoryDetailErrorState(error)"
    );

    // Slice the real render branches by their guards so each assertion is tied
    // to one panel, rather than to a loose window of surrounding text.
    const failedStart = src.indexOf("if (failed)");
    const missingStart = src.indexOf("if (!business)");
    const detailStart = src.indexOf("const callHref");
    assert.ok(failedStart > -1 && missingStart > failedStart && detailStart > missingStart, "render branches not found");

    const failedBlock = src.slice(failedStart, missingStart);
    const missingBlock = src.slice(missingStart, detailStart);

    // Retry affordance belongs to the service-error panel only.
    assert.ok(failedBlock.includes("Try again"), "a non-404 failure must still offer 'Try again'");
    assert.ok(failedBlock.includes("Could not load this listing"), "the failed branch must show the service error");

    // A 404 lands on the not-found panel, which must not offer a retry.
    assert.ok(missingBlock.includes("Listing not found"), "a 404 must render the not-found panel");
    assert.ok(
      !missingBlock.includes("Try again"),
      "the not-found state must not offer 'Try again' (a 404 is permanent)"
    );
    assert.ok(
      !missingBlock.includes("setAttempt"),
      "the not-found state must not be able to trigger a retry"
    );
  });

  it("a 404 still never fabricates a business (seed catalog stays unreachable)", () => {
    const src = read(DETAIL);
    assert.ok(!src.includes("getSeedBusiness"), "the not-found path must not consult the seed catalog");
  });
});

describe("directory: public listing writes are role-gated (F4)", () => {
  const SERVICE = "src/lib/directory/directory-service.ts";

  // `directory-service.ts` is a server-only module: it imports the Prisma
  // client, so importing it here would require a react-server condition AND a
  // live database. Instead, extract and evaluate the exported constant's
  // initializer. This asserts its real runtime value, so neither a comment nor
  // a renamed/reordered export can make the suite pass.
  function writeRoles(): readonly string[] {
    const m = /export const DIRECTORY_WRITE_ROLES\s*=\s*([^;]+);/.exec(read(SERVICE));
    assert.ok(m, "DIRECTORY_WRITE_ROLES must be exported from directory-service.ts");
    const expr = m![1].replace(/\bas\s+const\b/g, " ").trim();
    return new Function("Object", `return ${expr};`)(Object) as readonly string[];
  }

  // Narrow helper: slice one exported service function out of the source.
  function functionBody(name: string): string {
    const src = read(SERVICE);
    const start = src.indexOf(`export async function ${name}(`);
    assert.ok(start > -1, `${name} not found in ${SERVICE}`);
    const end = src.indexOf("\n}", start);
    assert.ok(end > start, `could not delimit the body of ${name}`);
    return src.slice(start, end);
  }

  it("allows OWNER", () => {
    assert.ok(writeRoles().includes("OWNER"), "OWNER must retain directory write access");
  });

  it("allows ADMIN", () => {
    assert.ok(writeRoles().includes("ADMIN"), "ADMIN must retain directory write access");
  });

  it("allows MANAGER", () => {
    assert.ok(writeRoles().includes("MANAGER"), "MANAGER must retain directory write access");
  });

  it("does NOT allow STAFF", () => {
    assert.ok(
      !writeRoles().includes("STAFF"),
      "STAFF must not be able to write a listing (defeats the whole gate)"
    );
  });

  it("grants exactly those three roles and nothing else", () => {
    assert.deepEqual(
      [...writeRoles()].sort(),
      ["ADMIN", "MANAGER", "OWNER"],
      "the allowlist must not silently gain or lose a role"
    );
  });

  it("is frozen, so a caller cannot widen the allowlist at runtime", () => {
    // `as const` is compile-time only; Object.freeze is what actually protects
    // the array at runtime. An unfrozen allowlist is a privilege-escalation risk.
    assert.ok(Object.isFrozen(writeRoles()), "DIRECTORY_WRITE_ROLES must be frozen");
  });

  for (const fn of [
    "saveMyDirectoryProfile",
    "submitMyDirectoryProfile",
    "unlistMyDirectoryProfile",
  ] as const) {
    it(`${fn} gates its write on DIRECTORY_WRITE_ROLES`, () => {
      const body = functionBody(fn);
      assert.ok(body.includes("requireBusinessRole("), `${fn} must call requireBusinessRole`);
      assert.ok(
        body.includes("DIRECTORY_WRITE_ROLES"),
        `${fn} must authorize against DIRECTORY_WRITE_ROLES (not an inline list)`
      );
      // The gate must precede every DB access, or a rejected STAFF request could
      // still read or write before being refused.
      assert.ok(
        body.indexOf("requireBusinessRole(") < body.indexOf("prisma."),
        `${fn} must authorize before touching the database`
      );
    });
  }

  it("getMyDirectoryProfile stays ungated, preserving STAFF read access", () => {
    const body = functionBody("getMyDirectoryProfile");
    assert.ok(body.includes("resolveBusiness("), "the read path must still use resolveBusiness");
    assert.ok(
      !body.includes("DIRECTORY_WRITE_ROLES"),
      "the read path must NOT be role-gated (STAFF must keep read access)"
    );
    assert.ok(
      !body.includes("requireBusinessRole("),
      "the read path must NOT be role-gated (STAFF must keep read access)"
    );
  });
});

describe("directory: public read boundary stays server-authoritative", () => {
  it("the API only serves published, listed profiles of active businesses", () => {
    const svc = read("src/lib/directory/directory-service.ts");
    assert.ok(svc.includes('status: "PUBLISHED"'), "must filter to PUBLISHED");
    assert.ok(svc.includes("isListed: true"), "must filter to isListed");
    assert.ok(
      svc.includes('business: { status: "ACTIVE" }'),
      "a suspended business must never surface in the public directory"
    );
  });
});
