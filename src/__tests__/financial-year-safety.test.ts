// Focused unit tests for the financial-year safety rules (F11 Phase 2-10):
// the document DATE is authoritative and the server derives the financial
// year from it, so a client-supplied financialYearId can never diverge from
// the date that actually governs the document.
//
// Covers the pure core in src/lib/financialYear.ts and src/lib/dates.ts:
//   - date -> FY mapping across the 31 Mar / 1 Apr boundary
//   - inclusive [startDate, endDate] containment (UTC date-key convention)
//   - mismatch detection (a date that the requested FY does NOT contain)
//   - local-calendar date helpers (the IST off-by-one default-date fix)
//
// Run: npx tsx src/__tests__/financial-year-safety.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  financialYearForDate,
  dateInFinancialYear,
  financialYearContainingDate,
  matchFinancialYear,
  todayKey,
} from "../lib/financialYear";
import { localDateString, parseLocalDate, addDaysLocal } from "../lib/dates";
import { FinancialYearSettings } from "../types";

// FY rows exactly as the server stores them (UTC boundaries, 31 Mar 23:59 UTC).
const fy2026: FinancialYearSettings = {
  id: "fy-2026-2027",
  name: "Financial Year 2026-27",
  startDate: "2026-04-01T00:00:00.000Z",
  endDate: "2027-03-31T23:59:59.000Z",
};
const fy2027: FinancialYearSettings = {
  id: "fy-2027-2028",
  name: "Financial Year 2027-28",
  startDate: "2027-04-01T00:00:00.000Z",
  endDate: "2028-03-31T23:59:59.000Z",
};

describe("date -> financial year mapping (authoritative rule)", () => {
  it("1 Apr 2026 belongs to FY 2026-27", () => {
    assert.deepEqual(financialYearForDate(new Date("2026-04-01T00:00:00Z")), fy2026);
  });

  it("31 Mar 2027 belongs to FY 2026-27", () => {
    assert.deepEqual(financialYearForDate(new Date("2027-03-31T23:59:59Z")), fy2026);
  });

  it("1 Apr 2027 belongs to FY 2027-28 (pairwise boundary)", () => {
    assert.deepEqual(financialYearForDate(new Date("2027-04-01T00:00:00Z")), fy2027);
    // 31 Mar 2027 is still 2026-27 — the year flips exactly at 1 Apr.
    assert.ok(dateInFinancialYear(fy2026, "2027-03-31"));
    assert.ok(!dateInFinancialYear(fy2026, "2027-04-01"));
    assert.ok(dateInFinancialYear(fy2027, "2027-04-01"));
    assert.ok(!dateInFinancialYear(fy2027, "2027-03-31"));
  });

  it("15 Jan 2027 belongs to FY 2026-27", () => {
    assert.ok(dateInFinancialYear(fy2026, "2027-01-15"));
  });

  it("31 Dec 2026 belongs to FY 2026-27", () => {
    assert.ok(dateInFinancialYear(fy2026, "2026-12-31"));
  });

  it("dates outside every configured FY are uncovered (gap at the start)", () => {
    assert.equal(financialYearContainingDate([fy2026, fy2027], "2026-03-31"), undefined);
  });

  it("dates beyond the last configured FY are uncovered (no silent FY)", () => {
    assert.equal(financialYearContainingDate([fy2026], "2028-04-01"), undefined);
    assert.equal(financialYearContainingDate([fy2026, fy2027], "2028-04-02"), undefined);
  });

  it("containment is order-independent (first covering FY wins)", () => {
    const hit = financialYearContainingDate([fy2027, fy2026], "2026-08-15");
    assert.equal(hit?.id, "fy-2026-2027");
  });
});

describe("the two specified mismatch cases reject (would 400), never silently replace", () => {
  // Server rule: derive FY from date via financialYearContainingDate, then
  // reject if derived.id !== requested financialYearId.
  it("1 Apr 2027 + FY 2026-27 is a mismatch", () => {
    const derived = financialYearContainingDate([fy2026, fy2027], "2027-04-01");
    assert.equal(derived?.id, "fy-2027-2028");
    assert.notEqual(derived?.id, fy2026.id); // requested FY 2026-27 => reject
  });

  it("31 Mar 2027 + FY 2027-28 is a mismatch", () => {
    const derived = financialYearContainingDate([fy2026, fy2027], "2027-03-31");
    assert.equal(derived?.id, "fy-2026-2027");
    assert.notEqual(derived?.id, fy2027.id); // requested FY 2027-28 => reject
  });

  it("an exact match passes", () => {
    const derived = financialYearContainingDate([fy2026, fy2027], "2026-12-31");
    assert.equal(derived?.id, fy2026.id); // requested FY 2026-27 => continue
  });

  it("matchFinancialYear matches by id or identical range", () => {
    assert.equal(matchFinancialYear([fy2026, fy2027], fy2026)?.id, "fy-2026-2027");
    const clone = { ...fy2026 };
    assert.equal(matchFinancialYear([fy2027, clone], fy2026)?.id, "fy-2026-2027");
    assert.equal(matchFinancialYear([fy2027], fy2026), undefined);
  });
});

describe("UTC date-key convention (inclusive boundaries, any timezone)", () => {
  it("compares document dates as calendar days, not instants", () => {
    // A document recorded at 23:59 UTC on 31 Mar 2027 is inside FY 2026-27,
    // even though that instant is 1 Apr morning in India.
    assert.ok(dateInFinancialYear(fy2026, new Date("2027-03-31T23:59:59.000Z")));
    assert.ok(dateInFinancialYear(fy2026, new Date("2027-03-31T15:59:59.999Z")));
    assert.ok(!dateInFinancialYear(fy2026, new Date("2027-04-01T00:00:00.000Z")));
  });

  it("todayKey is stable across timezones for a given calendar day", () => {
    assert.equal(todayKey(new Date("2026-04-01T20:00:00Z")), 20260401);
    assert.equal(todayKey(new Date("2027-03-31T10:00:00Z")), 20270331);
  });

  it("invalid dates never match a range", () => {
    assert.equal(dateInFinancialYear(fy2026, "not-a-date"), false);
  });
});

describe("local-calendar date helpers (default-date fix)", () => {
  it("round-trips a local calendar date", () => {
    const d = parseLocalDate("2027-04-01");
    assert.ok(d);
    assert.equal(d!.getFullYear(), 2027);
    assert.equal(d!.getMonth() + 1, 4);
    assert.equal(d!.getDate(), 1);
    assert.equal(localDateString(d!), "2027-04-01");
  });

  it("crosses the financial-year boundary with day arithmetic", () => {
    assert.equal(addDaysLocal("2027-03-31", 1), "2027-04-01");
    assert.equal(addDaysLocal("2026-04-01", -1), "2026-03-31");
    assert.equal(addDaysLocal("2026-04-01", 14), "2026-04-15");
  });

  it("rejects malformed or out-of-range input", () => {
    assert.equal(parseLocalDate("2027/04/01"), null);
    assert.equal(parseLocalDate("2027-04"), null);
    assert.equal(parseLocalDate("2027-13-01"), null);
    assert.equal(parseLocalDate("2027-02-30"), null);
    assert.equal(addDaysLocal("garbage", 1), "garbage");
  });
});