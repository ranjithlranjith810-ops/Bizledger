// Server-side FinancialYear service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) before touching any data.
// A financial year always belongs to exactly ONE business; all reads/writes are
// scoped to the verified business, so a caller can never read or mutate another
// tenant's financial years.
//
// India fiscal-year rule: 1 April YYYY -> 31 March YYYY+1 (e.g. 1 Apr 2026 ->
// 31 Mar 2027 = "Financial Year 2026-27"). Name follows the frontend
// `FinancialYearSettings.name` format so the legacy `fySlug`/numbering logic
// stays aligned.

import { prisma } from "@/lib/prisma";
import { requireBusinessPermission } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import {
  dateInFinancialYear,
  financialYearContainingDate,
} from "@/lib/financialYear";
import type { Prisma } from "@/generated/prisma/client";

// Prisma unique-constraint violation code.
const PRISMA_UNIQUE_CONSTRAINT = "P2002";

const NAME_RE = /^Financial Year (\d{4})-(\d{2})$/;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function validateBusinessId(businessId: unknown): string {
  const id = str(businessId);
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown): string {
  const v = str(id);
  if (!v) throw new ValidationError("Missing resource id");
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

// Parse an India FY start year from a "Financial Year 2026-27" style label.
function labelStartYear(label: string): number | undefined {
  const m = NAME_RE.exec(label);
  if (!m) return undefined;
  return Number(m[1]);
}

// Build the canonical FY label for an India start year (e.g. 2026 -> "Financial
// Year 2026-27").
export function financialYearLabel(startYear: number): string {
  return `Financial Year ${startYear}-${String(startYear + 1).slice(2)}`;
}

// Canonical India-FY boundaries for a start year (start = 1 Apr, end = 31 Mar of
// the following year) as JS Date objects.
function indiaFyBoundaries(startYear: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)),
    end: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59)),
  };
}

// Normalize + validate the raw FY input. Returns a Prisma create/update payload.
function normalizeFinancialYearInput(
  raw: Record<string, unknown>,
  partial = false,
) {
  const out: Record<string, unknown> = {};

  const name = str(raw.name);
  const startInput = raw.startDate == null ? undefined : new Date(String(raw.startDate));
  const endInput = raw.endDate == null ? undefined : new Date(String(raw.endDate));

  if (startInput !== undefined && Number.isNaN(startInput.getTime())) {
    throw new ValidationError("startDate is not a valid date");
  }
  if (endInput !== undefined && Number.isNaN(endInput.getTime())) {
    throw new ValidationError("endDate is not a valid date");
  }

  let startYear: number | undefined;
  if (startInput) {
    if (startInput.getUTCMonth() !== 3 || startInput.getUTCDate() !== 1) {
      throw new ValidationError("Financial year must start on 1 April (UTC)");
    }
    startYear = startInput.getUTCFullYear();
  }

  // Derive the canonical label from the start year when none supplied.
  let label = name;
  if (!label && startYear !== undefined) {
    label = financialYearLabel(startYear);
  }
  if (partial && label === undefined) {
    // Nothing about the label was provided; caller intends a partial update.
  } else {
    if (!label) throw new ValidationError("name is required");
    const ly = labelStartYear(label);
    if (ly === undefined) {
      throw new ValidationError('name must look like "Financial Year 2026-27"');
    }
    if (startYear !== undefined && ly !== startYear) {
      throw new ValidationError("name start year does not match startDate");
    }
    startYear = ly;
    out.name = label;
  }

  // Validate the end date against the canonical 31 Mar of the following year.
  if (endInput !== undefined && startYear !== undefined) {
    const canonical = indiaFyBoundaries(startYear).end;
    const same = endInput.getTime() === canonical.getTime();
    const within = endInput.getUTCMonth() === 2 && endInput.getUTCDate() === 31;
    if (!same && !within) {
      throw new ValidationError("Financial year must end on 31 March (UTC)");
    }
  }
  if (startYear !== undefined) {
    out.startDate = indiaFyBoundaries(startYear).start;
    out.endDate = indiaFyBoundaries(startYear).end;
  }

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    if (v !== undefined) clean[k] = v;
  }
  return clean as { name?: string; startDate?: Date; endDate?: Date };
}

function toFinancialYearJson(fy: {
  id: string;
  businessId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: fy.id,
    businessId: fy.businessId,
    name: fy.name,
    startDate: fy.startDate.toISOString(),
    endDate: fy.endDate.toISOString(),
    isActive: fy.isActive,
    createdAt: fy.createdAt.toISOString(),
    updatedAt: fy.updatedAt.toISOString(),
  };
}

export type FinancialYearJson = ReturnType<typeof toFinancialYearJson>;

/**
 * F10 — financial-year integrity gate. A new financial document (invoice,
 * estimate, quotation, purchase order) may only be created against an ACTIVE
 * financial year. When a year is closed (switched away / no longer active),
 * historical documents remain readable, but NO new documents may be booked
 * into it. Throws ValidationError (400) for closed years.
 */
export function assertFinancialYearActive(fy: { isActive: boolean }): void {
  if (!fy.isActive) {
    throw new ValidationError(
      "The selected financial year is not active; new documents cannot be created in a closed financial year",
    );
  }
}

/**
 * F11 — date-owned financial-year authority. A document date must fall INSIDE
 * the financial year it is pinned to (inclusive boundaries: startDate <= date
 * <= endDate). The document date is authoritative; the client-supplied
 * financialYearId is verified against it, never taken alone, and never
 * silently replaced.
 */
export function assertDateInFinancialYear(
  date: Date,
  fy: {
    id: string;
    name: string;
    startDate: string | Date;
    endDate: string | Date;
  },
  docLabel: string,
): void {
  if (!dateInFinancialYear(fy, date)) {
    throw new ValidationError(
      `${docLabel} date ${date.toISOString().slice(0, 10)} does not belong to ${fy.name} (${boundaryIso(
        fy.startDate,
      ).slice(0, 10)} to ${boundaryIso(fy.endDate).slice(0, 10)}); the financial year is derived from the document date`,
    );
  }
}

// Normalize an FY boundary (Date | ISO string) to an ISO-YYYY-MM-DD string.
function boundaryIso(v: string | Date): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/**
 * Async date/FY guard for DRAFT document edits. The document's financial year
 * binding is immutable (PROTECTED_KEYS), so a changed document date must stay
 * inside that same year. Rejects cross-FY date changes with a 400 — the draft
 * is never moved, renumbered, or rewritten.
 */
export async function assertDocumentDateInFinancialYear(
  businessIdInput: unknown,
  financialYearIdInput: unknown,
  date: Date,
  docLabel: string,
): Promise<void> {
  const businessId = validateBusinessId(businessIdInput);
  const fy = await prisma.financialYear.findFirst({
    where: { id: validateId(financialYearIdInput), businessId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  assertDateInFinancialYear(date, fy, docLabel);
}

/**
 * Create a financial year in the member's verified business. Activates it when
 * it is the business's FIRST financial year. Enforces the single-active
 * invariant transactionally (a partial unique DB index on the business also
 * backstops it). Duplicate name -> DuplicateResourceError (409).
 */
export async function createFinancialYear(
  businessIdInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "settings", "edit");
  // Non-partial normalization always populates name/startDate/endDate.
  const data = normalizeFinancialYearInput(raw) as {
    name: string;
    startDate: Date;
    endDate: Date;
  };

  const fy = await prisma.$transaction(async (tx) => {
    const existing = await tx.financialYear.findFirst({
      where: { businessId },
      select: { id: true },
    });

    const created = await tx.financialYear.create({
      data: {
        businessId,
        ...data,
        isActive: !existing,
      },
    });
    return created;
  }).catch((err) => {
    // Unique constraint on (businessId, name) -> duplicate financial year.
    if (err && (err as { code?: string }).code === PRISMA_UNIQUE_CONSTRAINT) {
      throw new DuplicateResourceError("A financial year with this name already exists");
    }
    throw err;
  });

  return toFinancialYearJson(fy);
}

/**
 * List financial years for the member's verified business (newest start first).
 */
export async function listFinancialYears(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const rows = await prisma.financialYear.findMany({
    where: { businessId },
    orderBy: { startDate: "desc" },
  });
  return rows.map(toFinancialYearJson);
}

/**
 * Get one financial year by id within the member's verified business.
 */
export async function getFinancialYear(
  businessIdInput: unknown,
  idInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const fy = await prisma.financialYear.findFirst({ where: { id, businessId } });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");
  return toFinancialYearJson(fy);
}

/**
 * Return the CURRENT (active, else containing today) financial year for the
 * member's business. Returns null when the business has no financial years yet.
 */
export async function currentFinancialYear(businessIdInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const now = new Date();

  const active = await prisma.financialYear.findFirst({
    where: { businessId, isActive: true },
  });
  if (active) return toFinancialYearJson(active);

  const rows = await prisma.financialYear.findMany({ where: { businessId } });
  if (rows.length === 0) return null;

  // Prefer the year containing today; else the most recent.
  const containing = rows.find(
    (f) => now >= f.startDate && now <= f.endDate,
  );
  const fallback = rows.sort(
    (a, b) => b.startDate.getTime() - a.startDate.getTime(),
  )[0];
  return toFinancialYearJson(containing ?? fallback);
}

/**
 * FY-for-date authority. Returns the EXISTING FinancialYear (DB row) whose
 * INCLUSIVE [startDate, endDate] range contains `date` — or null when no
 * configured year covers it. Document services call this to derive the
 * financial year from the authoritative document date, then verify the
 * client-supplied financialYearId against the result.
 */
export async function financialYearForBusinessDate(
  businessIdInput: unknown,
  date: Date,
) {
  const businessId = validateBusinessId(businessIdInput);
  await requireBusinessPermission(businessId, "invoices", "view");

  const contained = await prisma.financialYear.findFirst({
    where: { businessId, startDate: { lte: date }, endDate: { gte: date } },
  });
  if (!contained) return null;
  return financialYearContainingDate(
    [
      {
        id: contained.id,
        name: contained.name,
        startDate: contained.startDate.toISOString(),
        endDate: contained.endDate.toISOString(),
      },
    ],
    date,
  );
}

/**
 * Activate a single financial year for the member's business. Transactionally
 * deactivates every other year, then marks the requested year active. The
 * partial unique DB index is the hard backstop for the single-active invariant.
 * A FUTURE financial year (start date later than today) cannot be activated
 * yet — documents are pinned to the year the date actually falls in, so
 * pre-activating a not-yet-started year would let the client mispost documents
 * into it. Historical years remain freely activatable.
 */
export async function activateFinancialYear(
  businessIdInput: unknown,
  idInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await requireBusinessPermission(businessId, "settings", "edit");

  const fy = await prisma.financialYear.findFirst({ where: { id, businessId } });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");

  if (fy.startDate.getTime() > Date.now()) {
    throw new ValidationError(
      `${fy.name} cannot be activated yet — it starts on ${fy.startDate.toISOString().slice(0, 10)}. A financial year may only be activated once it has started.`,
    );
  }

  // PRISMA: composite unique on (businessId, name) plus single-active invariant.
  return prisma.$transaction(async (tx) => {
    await tx.financialYear.updateMany({
      where: { businessId, id: { not: id } },
      data: { isActive: false },
    });
    const updated = await tx.financialYear.update({
      where: { id },
      data: { isActive: true },
    });
    return toFinancialYearJson(updated);
  });
}

// Kept for typing parity with other services in this repository.
export type FinancialYearWhereInput = Prisma.FinancialYearWhereInput;
