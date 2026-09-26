// Regression tests for the public Business Directory search-query guard.
//
// The public directory search endpoint is unauthenticated, so `q` reaches a
// database filter straight from the request. The production-safety audit
// required the query length to be bounded, and required that bound to be
// measured on the RAW input rather than after whitespace normalization --
// otherwise a caller could pad an oversized query past the guard, which is
// precisely the case the guard exists to stop.
//
// The decision logic is therefore a pure, dependency-free module
// (`src/lib/directory/query-utils.ts`) so it can be executed directly. It is
// NOT testable from `directory-service.ts`, which is a `server-only` module
// that imports the Prisma client and therefore cannot be imported here at all.
//
// Run: npx tsx src/__tests__/directory-query-utils.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTORY_QUERY_MAX_LENGTH,
  DIRECTORY_QUERY_TOO_LONG,
  prepareDirectoryQuery,
} from "../lib/directory/query-utils";

describe("directory: public search query is length-bounded", () => {
  it("rejects a query one character over the limit", () => {
    const result = prepareDirectoryQuery("a".repeat(DIRECTORY_QUERY_MAX_LENGTH + 1));
    assert.equal(result.ok, false);
  });

  it("accepts a query of exactly 200 characters", () => {
    const raw = "a".repeat(200);
    assert.equal(raw.length, 200, "fixture must be exactly at the limit");
    const result = prepareDirectoryQuery(raw);
    assert.equal(result.ok, true, "a 200-character query is within the limit");
  });

  it("identifies the length limit as the rejection reason", () => {
    const result = prepareDirectoryQuery("a".repeat(201));
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    assert.equal(result.reason, "too-long");
  });

  it("keeps the user-facing message stable", () => {
    // The service layer throws this message inside a ValidationError, which
    // handleApiError maps to HTTP 400. Pinned here because the string is the
    // only part of the rejection that reaches an unauthenticated caller.
    assert.equal(DIRECTORY_QUERY_TOO_LONG, "Search query is too long");
  });

  it("does not accept a megabyte-scale query", () => {
    const result = prepareDirectoryQuery("a".repeat(1_000_000));
    assert.equal(result.ok, false);
  });
});

describe("directory: the length limit is measured BEFORE normalization", () => {
  // These two cases are the whole point. Normalization collapses whitespace, so
  // measuring the limit afterwards would shrink the string under test and let an
  // oversized request through. A one-space prefix is enough to expose it.

  it("accepts 200 raw characters that would collapse below the limit", () => {
    const raw = " " + "a".repeat(199);
    assert.equal(raw.length, 200, "raw input is exactly at the limit");
    // After trim/collapse this would measure 199 -- still under, so this case
    // alone does not discriminate. The companion test below does.
    const result = prepareDirectoryQuery(raw);
    assert.equal(result.ok, true);
  });

  it("rejects 201 raw characters even though normalization would shrink them", () => {
    const raw = " " + "a".repeat(200);
    assert.equal(raw.length, 201, "raw input is one over the limit");
    // After trim/collapse this measures exactly 200 and would be ACCEPTED by a
    // post-normalization guard. The raw-length guard rejects it, which is the
    // behavior that stops a whitespace-padded oversized query.
    const collapsed = raw.trim().replace(/\s+/g, " ");
    assert.equal(collapsed.length, 200, "post-normalization length sits under the limit");
    const result = prepareDirectoryQuery(raw);
    assert.equal(result.ok, false, "must be rejected on raw length, not normalized length");
    if (result.ok) throw new Error("expected rejection");
    assert.equal(result.reason, "too-long");
  });

  it("rejects a long whitespace run that normalizes to nothing at all", () => {
    const raw = " ".repeat(500);
    // Normalizes to the empty string, so a post-normalization guard would let
    // this through entirely.
    const result = prepareDirectoryQuery(raw);
    assert.equal(result.ok, false);
  });
});

describe("directory: query normalization is unchanged", () => {
  function accepted(v: unknown): string {
    const result = prepareDirectoryQuery(v);
    if (!result.ok) throw new Error(`expected acceptance, got ${result.reason}`);
    return result.value;
  }

  it("collapses internal whitespace runs to a single space", () => {
    assert.equal(accepted("  hello   world  "), "hello world");
  });

  it("trims leading and trailing whitespace", () => {
    assert.equal(accepted("\t\n hello \r\n"), "hello");
  });

  it("passes an ordinary query through untouched", () => {
    assert.equal(accepted("sri lanka"), "sri lanka");
  });

  it("does not change casing", () => {
    assert.equal(accepted("Coimbatore TEXTILES"), "Coimbatore TEXTILES");
  });

  it("leaves a single-word query alone", () => {
    assert.equal(accepted("machines"), "machines");
  });

  it("treats null as an empty query rather than throwing", () => {
    assert.equal(accepted(null), "");
  });

  it("treats undefined as an empty query rather than throwing", () => {
    assert.equal(accepted(undefined), "");
  });

  it("accepts an empty string", () => {
    assert.equal(accepted(""), "");
  });

  it("accepts a whitespace-only query that is within the limit", () => {
    // Contrast with the 500-space case above: short whitespace is fine and
    // normalizes to empty, which the caller then treats as "no filter".
    assert.equal(accepted("   "), "");
  });

  it("coerces a non-string input the same way the original helper did", () => {
    assert.equal(accepted(42), "42");
    assert.equal(accepted(false), "false");
  });
});