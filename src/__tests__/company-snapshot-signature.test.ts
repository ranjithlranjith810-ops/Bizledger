// Fix A regression tests - authoritative company snapshot + image data URLs.
//
// Regression: Company Profile stores the logo and the business signature as
// inline base64 data URLs (FileReader.readAsDataURL / canvas.toDataURL), and the
// PDF renderers (embedDataUrlImage) can ONLY decode that shape. But the document
// services used to accept a client-supplied `company` object and push EVERY
// company field through the generic MAX_STRING (1000) short-text cap, so a real
// signature (~137 KB) failed document creation with:
//
//     HTTP 400  {"error":"company.digitalSignatureUrl is too long"}
//
// What is locked in here:
//
//   1. a realistic >1000-character PNG data URL is accepted as the company
//      signature and survives the snapshot intact (no truncation, no rewrite);
//   2. the same holds for the Quotation and Invoice services, which now share
//      ONE snapshot implementation instead of a drifting duplicate;
//   3. the snapshot is built from the AUTHORITATIVE stored profile, so a
//      client cannot forge companyName / gstin / address / signature;
//   4. no signature at all still works;
//   5. the pre-existing short-text cap is NOT weakened - an over-long
//      companyName still fails;
//   6. company-profile persistence now rejects non-image, malformed and
//      oversized image values while accepting valid PNG/JPEG data URLs.
//
// The decision logic lives in two dependency-light modules so it can be run
// directly; the service files are asserted structurally (that each one sources
// the snapshot from the stored profile) rather than by importing them, because
// the services are `server-only` modules that pull in the Prisma client.
//
// Run: npx tsx src/__tests__/company-snapshot-signature.test.ts
//      (with NODE_OPTIONS=--conditions=react-server)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MAX_STRING,
  buildCompanySnapshot,
  companyProfileRecord,
} from "../lib/sales-document/shared";
import {
  MAX_IMAGE_DATA_URL_LENGTH,
  checkImageDataUrl,
  isImageDataUrl,
} from "../lib/image-data-url";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), "src", rel), "utf8");

// A base64 body long enough to be unmistakably over MAX_STRING. 140k characters
// mirrors the largest signature actually stored in the app, so this is a
// realistic fixture rather than a synthetic edge case.
const longBase64 = "A".repeat(140_366);
const PNG_SIGNATURE = `data:image/png;base64,${longBase64}`;
const JPEG_LOGO = `data:image/jpeg;base64,${longBase64}`;

const STORED_PROFILE = {
  companyName: "ISWAYAM TRADER",
  gstin: "27AACCR0000A1Z5",
  pan: "AACCR0000A",
  city: "Coimbatore",
  state: "Tamil Nadu (33)",
  pincode: "641001",
  mobile: "9876543210",
  digitalSignatureUrl: PNG_SIGNATURE,
};

// A hostile request body: every identity field forged.
const FORGED_CLIENT_COMPANY = {
  companyName: "ATTACKER COMPANY",
  gstin: "ATTACKER GSTIN",
  pan: "AAAAA0000A",
  city: "Nowhere",
  digitalSignatureUrl: "data:image/png;base64,Zm9yZ2Vk",
};

const SERVICES = [
  "lib/sales-document/estimate-service.ts",
  "lib/sales-document/quotation-service.ts",
  "lib/invoice/invoice-service.ts",
];

describe("fix A: the short-text cap no longer rejects an inline signature", () => {
  it("the fixture signature really is over the generic short-text cap", () => {
    assert.ok(
      PNG_SIGNATURE.length > MAX_STRING,
      "fixture must exceed MAX_STRING or the regression is not exercised",
    );
  });

  it("accepts a >1000-char PNG data URL as the company signature (estimate/quotation)", () => {
    const snap = buildCompanySnapshot({ digitalSignatureUrl: PNG_SIGNATURE });
    assert.equal(snap.digitalSignatureUrl, PNG_SIGNATURE);
  });

  it("preserves the signature byte-for-byte (no truncation, no rewrite)", () => {
    const snap = buildCompanySnapshot({ digitalSignatureUrl: PNG_SIGNATURE });
    assert.equal(snap.digitalSignatureUrl!.length, PNG_SIGNATURE.length);
    assert.ok(isImageDataUrl(snap.digitalSignatureUrl));
  });

  it("accepts a >1000-char JPEG data URL as the company logo", () => {
    const snap = buildCompanySnapshot({ logoUrl: JPEG_LOGO });
    assert.equal(snap.logoUrl, JPEG_LOGO);
  });

  it("all three document services share ONE snapshot implementation", () => {
    for (const svc of SERVICES) {
      const src = read(svc);
      assert.match(
        src,
        /buildCompanySnapshot\(\s*companyProfileRecord\(business\)\s*\)/,
        `${svc} must build the company snapshot from the stored profile`,
      );
    }
    // invoice-service previously carried its own duplicate whitelist.
    const invoice = read("lib/invoice/invoice-service.ts");
    assert.doesNotMatch(
      invoice,
      /function buildCompanySnapshot/,
      "invoice-service must not redefine a competing snapshot implementation",
    );
  });

  it("preserves the existing snapshot shape for text fields", () => {
    const snap = buildCompanySnapshot(STORED_PROFILE);
    assert.equal(snap.companyName, "ISWAYAM TRADER");
    assert.equal(snap.gstin, "27AACCR0000A1Z5");
    assert.equal(snap.pan, "AACCR0000A");
    assert.equal(snap.city, "Coimbatore");
    assert.equal(snap.state, "Tamil Nadu (33)");
    assert.equal(snap.pincode, "641001");
    assert.equal(snap.mobile, "9876543210");
  });
});

describe("fix A: the snapshot is authoritative, not client-supplied", () => {
  it("no document service feeds a request-supplied company into the snapshot", () => {
    for (const svc of SERVICES) {
      const src = read(svc);
      assert.doesNotMatch(
        src,
        /buildCompanySnapshot\(\s*\(?\s*raw\.company/,
        `${svc} must not snapshot raw.company`,
      );
    }
  });

  it("reads the profile from the business row the server already loaded", () => {
    const record = companyProfileRecord({ companyProfileJson: STORED_PROFILE });
    const snap = buildCompanySnapshot(record);
    assert.equal(snap.companyName, "ISWAYAM TRADER");
    assert.equal(snap.gstin, "27AACCR0000A1Z5");
    assert.equal(snap.digitalSignatureUrl, PNG_SIGNATURE);
  });

  it("a forged client company object cannot influence the snapshot", () => {
    const record = companyProfileRecord({ companyProfileJson: STORED_PROFILE });
    const snap = buildCompanySnapshot(record);
    assert.equal(snap.companyName, "ISWAYAM TRADER");
    assert.equal(snap.gstin, "27AACCR0000A1Z5");
    for (const field of Object.keys(FORGED_CLIENT_COMPANY)) {
      const forged = FORGED_CLIENT_COMPANY[field as keyof typeof FORGED_CLIENT_COMPANY];
      assert.notEqual(
        snap[field],
        forged,
        `${field} must not reflect the forged client value`,
      );
    }
  });

  it("tolerates a business with no stored profile", () => {
    assert.equal(companyProfileRecord({ companyProfileJson: null }), null);
    assert.equal(companyProfileRecord(null), null);
    assert.equal(companyProfileRecord(undefined), null);
    assert.equal(companyProfileRecord({ companyProfileJson: [] }), null);
    assert.deepEqual(buildCompanySnapshot(companyProfileRecord({})), {});
  });
});

describe("fix A: optional signature behaviour is unchanged", () => {
  it("a company with no signature and no logo still snapshots", () => {
    const snap = buildCompanySnapshot({
      companyName: "ISWAYAM TRADER",
      gstin: "27AACCR0000A1Z5",
    });
    assert.equal(snap.companyName, "ISWAYAM TRADER");
    assert.equal("digitalSignatureUrl" in snap, false);
    assert.equal("logoUrl" in snap, false);
  });

  it("an empty signature string is treated as absent, not as an error", () => {
    const snap = buildCompanySnapshot({ digitalSignatureUrl: "", logoUrl: "" });
    assert.equal("digitalSignatureUrl" in snap, false);
    assert.equal("logoUrl" in snap, false);
  });
});

describe("fix A: the pre-existing short-text validation is not weakened", () => {
  it("an over-long companyName still fails", () => {
    assert.throws(
      () => buildCompanySnapshot({ companyName: "x".repeat(MAX_STRING + 1) }),
      /company\.companyName is too long/,
    );
  });

  it("a companyName of exactly MAX_STRING is still accepted", () => {
    const name = "x".repeat(MAX_STRING);
    assert.equal(buildCompanySnapshot({ companyName: name }).companyName, name);
  });

  it("other short fields remain bounded too", () => {
    assert.throws(
      () => buildCompanySnapshot({ city: "y".repeat(MAX_STRING + 1) }),
      /company\.city is too long/,
    );
  });
});

describe("fix A: company-profile persistence validates image data URLs", () => {
  it("accepts valid PNG and JPEG data URLs", () => {
    for (const ok of [
      PNG_SIGNATURE,
      JPEG_LOGO,
      "data:image/jpg;base64,iVBORw0KGgo=",
      "data:image/png;base64,AAAA",
    ]) {
      const { value, error } = checkImageDataUrl(ok);
      assert.equal(error, undefined, `expected ${ok.slice(0, 24)} to be valid`);
      assert.equal(value, ok);
    }
  });

  it("rejects a non-image arbitrary string", () => {
    const { error } = checkImageDataUrl("just some text");
    assert.match(String(error), /base64 image data URL/);
  });

  it("rejects a normal http(s) URL, which the PDF renderers would drop anyway", () => {
    assert.match(String(checkImageDataUrl("https://cdn.example.com/sig.png").error), /base64 image data URL/);
  });

  it("rejects an unsupported image mime type", () => {
    assert.match(String(checkImageDataUrl("data:image/gif;base64,AAAA").error), /base64 image data URL/);
    assert.match(String(checkImageDataUrl("data:image/svg+xml;base64,AAAA").error), /base64 image data URL/);
  });

  it("rejects a malformed data URL", () => {
    assert.match(String(checkImageDataUrl("data:image/png;base64,").error), /base64 image data URL/);
    assert.match(String(checkImageDataUrl("data:image/png;base64,***").error), /base64 image data URL/);
    assert.match(String(checkImageDataUrl("data:image/png,AAAA").error), /base64 image data URL/);
  });

  it("rejects oversized image data at save time", () => {
    const huge = `data:image/png;base64,${"A".repeat(MAX_IMAGE_DATA_URL_LENGTH)}`;
    assert.match(String(checkImageDataUrl(huge).error), /too large/);
  });

  it("the ceiling is a real bound, comfortably above the largest stored signature", () => {
    assert.ok(MAX_IMAGE_DATA_URL_LENGTH > 140_366);
    assert.ok(MAX_IMAGE_DATA_URL_LENGTH <= 8 * 1024 * 1024, "must stay bounded");
  });

  it("treats blank input as 'clear this field', preserving existing semantics", () => {
    assert.deepEqual(checkImageDataUrl(""), {});
    assert.deepEqual(checkImageDataUrl("   "), {});
    assert.deepEqual(checkImageDataUrl(undefined), {});
    assert.deepEqual(checkImageDataUrl(null), {});
  });

  it("updateBusinessForMember validates BOTH image keys on save", () => {
    const src = read("lib/business/business-service.ts");
    assert.match(src, /PROFILE_IMAGE_KEYS = \["logoUrl", "digitalSignatureUrl"\]/);
    assert.match(src, /checkImageDataUrl\(profile\[key\]\)/);
    assert.match(
      src,
      /new ProfileValidationError\(`companyProfile\.\$\{key\} \$\{error\}`\)/,
      "must surface a clear 400 validation error",
    );
  });
});
