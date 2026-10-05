// Server-side DocumentSequence service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) and verifies the target
// financial year belongs to that same business. A caller can never allocate a
// number against another tenant's business or financial year.
//
// ONE SOURCE OF TRUTH: the server. The client never owns a counter (see the
// `Preview → read-only` rule below); localStorage is not numbering authority.
//
// ALLOCATION IS ATOMIC AND RECONCILING: never SELECT-then-increment in
// JavaScript (a race would hand out duplicate numbers under concurrency).
// Instead we (1) ensure the per-(business, financialYear, kind) row exists via
// INSERT ... ON CONFLICT DO NOTHING, then (2) a single UPDATE ... RETURNING that
// takes the row lock and, in the SAME statement, raises the counter to the
// document high-water mark before handing out a number:
//
//     allocated = GREATEST(counter, highest_existing_ordinal + 1, 1)
//     nextNumber = allocated + 1
//
// The high-water mark is computed as a correlated subquery against the real
// document table inside that UPDATE, so reconciliation is not a separate step a
// concurrent allocator could interleave with. Under READ COMMITTED a blocked
// writer re-reads the committed row version (EvalPlanQual) and re-evaluates the
// subquery, so two concurrent creates can never derive the same number.
//
// A COUNTER THAT RUNS AHEAD OF THE DOCUMENTS IS AUTHORITATIVE and is never moved
// backwards: if the counter is 12 and the highest stored invoice is 8, the next
// number is 12, not 9. Deleted or voided numbers are therefore permanently
// burned rather than reused, because a number may already have been issued,
// printed, emailed, paid against, or referenced elsewhere.
//
// This matches the frontend `nextSequence` semantics (returns the next unused
// number) exactly.

import { prisma } from "@/lib/prisma";
import { getBusinessForMember } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
} from "@/lib/business/api-error";

// Structural subset of a Prisma client / transaction client used by the raw
// allocation statements. Both `prisma` and a `$transaction` client satisfy it,
// so allocation can run inside the same transaction that creates the invoice
// (never a SELECT-then-increment, and a failure rolls back both the number and
// the insert).
export interface SequenceDb {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  financialYear: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  documentSequence: {
    findFirst(args: unknown): Promise<{
      id: string;
      businessId: string;
      financialYearId: string;
      kind: string;
      prefix: string;
      nextNumber: number;
      createdAt: Date;
      updatedAt: Date;
    } | null>;
  };
}

// Document kinds mirror the frontend `SequenceKind`. Column values match the
// Prisma `DocumentKind` enum.
export const DOCUMENT_KINDS = [
  "invoice",
  "quotation",
  "estimate",
  "purchaseOrder",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

// Default prefix per document kind (frontend DEFAULT: INV / QT / EST / PO).
const DEFAULT_PREFIX: Record<DocumentKind, string> = {
  invoice: "INV",
  quotation: "QT",
  estimate: "EST",
  purchaseOrder: "PO",
};

// Physical table + number column backing each document kind. Used ONLY to build
// the high-water-mark subquery that reconciles the counter with the documents
// that actually exist.
//
// SECURITY: these are hard-coded internal identifiers, never caller input. They
// are only ever reached after `validateKind` has rejected anything outside
// DOCUMENT_KINDS, so no user-controlled string is ever interpolated into SQL.
// (Only values are ever bound as parameters.)
const KIND_TABLE: Record<DocumentKind, { table: string; column: string }> = {
  invoice: { table: "invoice", column: "invoiceNumber" },
  quotation: { table: "quotation", column: "quotationNumber" },
  estimate: { table: "estimate", column: "estimateNumber" },
  purchaseOrder: { table: "purchase_order", column: "poNumber" },
};

// Trailing-ordinal extraction shared by the reconciling subqueries. Numbers look
// like `INV/26-27/007`; the trailing digit run is the ordinal. The {1,12} bound
// keeps the value safely inside bigint range and mirrors the digits-per-number
// format the app produces. A purely descriptive number (`PAID-JAN`) yields NULL
// and therefore does not constrain the sequence — matching `parseTrailingSequence`.
const TRAILING_ORDINAL = `substring(d.{col} from '([0-9]{1,12})[[:space:]]*$')`;

/**
 * SQL for `highest existing ordinal + 1` for a kind, scoped to one
 * (business, financialYear) pair. `businessParam` / `fyParam` are placeholder
 * tokens ("$1" / "$2", or "s.\"businessId\"" when correlated against the
 * sequence row inside the UPDATE).
 *
 * Returns 1 when the kind has no documents at all, so an empty table can never
 * suppress the counter.
 */
function highWaterMarkSql(
  kind: DocumentKind,
  businessParam: string,
  fyParam: string,
): string {
  const { table, column } = KIND_TABLE[kind];
  const ordinal = TRAILING_ORDINAL.replace("{col}", `"${column}"`);
  return `COALESCE((SELECT MAX(NULLIF(${ordinal}, '')::bigint)
      FROM "${table}" d
     WHERE d."businessId" = ${businessParam} AND d."financialYearId" = ${fyParam}), 0) + 1`;
}

function normalizePrefix(input: unknown, kind: DocumentKind): string {
  const s = String(input ?? "").trim();
  if (!s) return DEFAULT_PREFIX[kind];
  // Match frontend normalizeInvoicePrefix: only alphabetic chars, uppercased.
  if (!/^[A-Za-z]+$/.test(s)) {
    throw new ValidationError("prefix must contain only letters");
  }
  return s.toUpperCase();
}

function validateKind(kind: unknown): DocumentKind {
  const k = String(kind ?? "").trim();
  const match = (DOCUMENT_KINDS as readonly string[]).find(
    (c) => c.toLowerCase() === k.toLowerCase(),
  );
  if (!match) throw new ValidationError("Invalid document kind");
  return match as DocumentKind;
}

function validateBusinessId(businessId: unknown): string {
  const id = String(businessId ?? "").trim();
  if (!id) throw new ValidationError("businessId is required");
  if (id.length > 64) throw new ValidationError("businessId is invalid");
  return id;
}

function validateId(id: unknown): string {
  const v = String(id ?? "").trim();
  if (!v) throw new ValidationError("Missing resource id");
  if (v.length > 64) throw new ValidationError("Invalid resource id");
  return v;
}

function toSequenceJson(s: {
  id: string;
  businessId: string;
  financialYearId: string;
  kind: string;
  prefix: string;
  nextNumber: number | bigint;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    businessId: s.businessId,
    financialYearId: s.financialYearId,
    kind: s.kind,
    prefix: s.prefix,
    nextNumber: Number(s.nextNumber),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export type SequenceJson = ReturnType<typeof toSequenceJson>;

/**
 * Ensure the per-(business, financialYear, kind) counter row exists, then
 * atomically allocate the next number and return it along with the updated
 * counter. Returns the PRE-increment (next unused) number — matching frontend
 * `nextSequence`.
 */
export async function allocateDocumentNumber(
  businessIdInput: unknown,
  fiscalYearIdInput: unknown,
  kindInput: unknown,
  prefixInput?: unknown,
  opts?: { db?: SequenceDb },
) {
  const db = opts?.db ?? prisma;
  const businessId = validateBusinessId(businessIdInput);
  const fiscalYearId = validateId(fiscalYearIdInput);
  const kind = validateKind(kindInput);
  await getBusinessForMember(businessId);

  // Verify the financial year belongs to the member's own business.
  const fy = await db.financialYear.findFirst({
    where: { id: fiscalYearId, businessId },
    select: { id: true },
  });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");

  const prefix = normalizePrefix(prefixInput, kind);

  // (1) Ensure the counter row exists (idempotent, race-safe).
  await db.$executeRawUnsafe(
    `INSERT INTO "document_sequence"
       ("id", "businessId", "financialYearId", "kind", "prefix", "nextNumber", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3::"DocumentKind", $4, 1, now())
     ON CONFLICT ("businessId", "financialYearId", "kind") DO NOTHING`,
    businessId,
    fiscalYearId,
    kind,
    prefix,
  );

  // (2) Atomically reconcile against the real documents AND allocate, in ONE
  // statement. The row lock serialises concurrent allocators; the subquery reads
  // the committed document rows for this (business, FY) pair.
  //
  //   allocated    = GREATEST(counter, highest_existing + 1, 1)
  //   nextNumber   = allocated + 1
  //
  // Correlation is against s."businessId"/s."financialYearId" so the subquery
  // binds to the locked row rather than re-deriving them. GREATEST keeps a
  // counter that already ran ahead of the documents authoritative, so numbers
  // are never reissued or reused and the counter never moves backwards.
  const highWater = highWaterMarkSql(kind, 's."businessId"', 's."financialYearId"');
  const rows = await db.$queryRawUnsafe<{ allocated: bigint }[]>(
    `UPDATE "document_sequence" s
        SET "nextNumber" = GREATEST(s."nextNumber", ${highWater}, 1) + 1,
            "updatedAt"  = now()
      WHERE s."businessId" = $1 AND s."financialYearId" = $2 AND s."kind" = $3::"DocumentKind"
      RETURNING ("nextNumber" - 1) AS "allocated"`,
    businessId,
    fiscalYearId,
    kind,
  );

  if (!rows.length) {
    throw new ResourceNotFoundError("Document sequence not found");
  }

  const allocated = Number(rows[0].allocated);

  // Return the resolved counter row for convenience.
  const seq = await db.documentSequence.findFirst({
    where: { businessId, financialYearId: fiscalYearId, kind },
  });
  if (!seq) throw new ResourceNotFoundError("Document sequence not found");

  return { ...toSequenceJson(seq), allocated, nextNumber: allocated + 1 };
}

/**
 * Read (without allocating) the number the NEXT create would receive, so a
 * create form can show an authoritative preview.
 *
 * This is deliberately a pure read: it issues a single SELECT and never creates,
 * reserves or advances anything. It computes the SAME logical result as
 * `allocateDocumentNumber` —
 *
 *     next = GREATEST(counter, highest_existing_ordinal + 1, 1)
 *
 * — using the identical high-water-mark subquery, so a preview can never
 * advertise a number the allocator would refuse to hand out. Because nothing is
 * written it cannot race the allocator and cannot consume a number, and the
 * preview no longer depends on any client-side cached counter — which is exactly
 * why previews used to drift: they were computed from a localStorage counter
 * that starts at 1 on a fresh browser and only advances when the user saves.
 *
 * When no counter row exists yet the allocator will seed it with
 * `nextNumber = 1`, so 1 is the correct baseline and no row is created merely to
 * render a preview.
 */
export async function peekDocumentNumber(
  businessIdInput: unknown,
  fiscalYearIdInput: unknown,
  kindInput: unknown,
  prefixInput?: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const fiscalYearId = validateId(fiscalYearIdInput);
  const kind = validateKind(kindInput);
  await getBusinessForMember(businessId);

  const fy = await prisma.financialYear.findFirst({
    where: { id: fiscalYearId, businessId },
    select: { id: true },
  });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");

  const highWater = highWaterMarkSql(kind, "$1", "$2");

  // Single read-only statement: stored prefix, stored counter, and the reconciled
  // next value all resolved together, so a preview can never show a number that
  // disagrees with what the allocator would produce.
  const rows = await prisma.$queryRawUnsafe<
    { prefix: string | null; nextNumber: bigint }[]
  >(
    `SELECT
        (SELECT s."prefix" FROM "document_sequence" s
          WHERE s."businessId" = $1 AND s."financialYearId" = $2
            AND s."kind" = $3::"DocumentKind") AS "prefix",
        GREATEST(
          COALESCE((SELECT s."nextNumber" FROM "document_sequence" s
                      WHERE s."businessId" = $1 AND s."financialYearId" = $2
                        AND s."kind" = $3::"DocumentKind"), 1),
          ${highWater},
          1
        ) AS "nextNumber"`,
    businessId,
    fiscalYearId,
    kind,
  );

  const row = rows[0];
  const storedPrefix = row?.prefix ?? null;

  return {
    businessId,
    financialYearId: fiscalYearId,
    kind,
    // An existing row's stored prefix is authoritative: it is the prefix the
    // server actually used to allocate previous numbers, so a stale client
    // prefix must not be allowed to relabel them. The caller's prefix (or the
    // default) is only the fallback for a counter that does not exist yet.
    prefix: normalizePrefix(storedPrefix ?? prefixInput, kind),
    nextNumber: row ? Number(row.nextNumber) : 1,
  };
}

/**
 * Read (without allocating) the current sequence rows for a member's business
 * and financial year. Mainly for introspection/tests; allocation must always go
 * through `allocateDocumentNumber`.
 */
export async function listSequences(
  businessIdInput: unknown,
  fiscalYearIdInput: unknown,
) {
  const businessId = validateBusinessId(businessIdInput);
  const fiscalYearId = validateId(fiscalYearIdInput);
  await getBusinessForMember(businessId);

  const fy = await prisma.financialYear.findFirst({
    where: { id: fiscalYearId, businessId },
    select: { id: true },
  });
  if (!fy) throw new ResourceNotFoundError("Financial year not found");

  const rows = await prisma.documentSequence.findMany({
    where: { businessId, financialYearId: fiscalYearId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toSequenceJson);
}

/**
 * Extract the ordinal a document number ends with, so a manually chosen number
 * can keep the auto sequence ahead of it.
 *
 * `INV/26-27/007` -> 7. Returns null when the label carries no trailing ordinal
 * (e.g. a purely descriptive number like "PAID-JAN"), which is legitimate — such
 * a number simply does not constrain the sequence.
 */
export function parseTrailingSequence(documentNumber: string): number | null {
  const m = /(\d+)\s*$/.exec(documentNumber.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Ensure the auto counter for this (business, FY, kind) is strictly greater than
 * `consumedOrdinal`, so the next automatic allocation cannot reissue a number a
 * user has already taken manually.
 *
 * NEVER MOVES THE COUNTER BACKWARDS: the new value is
 *
 *     GREATEST(counter, consumedOrdinal + 1, highest_existing_ordinal + 1, 1)
 *
 * so a manual number of 15 when the counter is already at 20 leaves it at 20,
 * and a manual number of 3 when documents already exist up to 8 still leaves the
 * counter ahead of the real documents. Deleted, voided and manually-spent
 * numbers stay permanently burned.
 *
 * Idempotent seeding (ON CONFLICT DO NOTHING) plus a forward-only single UPDATE
 * keep it safe against a concurrent allocator: the row lock serialises the two,
 * and GREATEST means neither can move the other backwards.
 */
export async function reserveSequenceAtLeast(
  db: SequenceDb,
  businessId: string,
  fiscalYearId: string,
  kind: DocumentKind,
  consumedOrdinal: number,
  prefixInput?: unknown,
): Promise<void> {
  if (!Number.isSafeInteger(consumedOrdinal) || consumedOrdinal <= 0) return;
  const prefix = normalizePrefix(prefixInput, kind);

  // Reconcile against the documents too, so seeding a missing row for a
  // business that already has documents cannot rewind the sequence to the
  // manually chosen number.
  const highWater = highWaterMarkSql(kind, "$1", "$2");

  await db.$executeRawUnsafe(
    `INSERT INTO "document_sequence"
       ("id", "businessId", "financialYearId", "kind", "prefix", "nextNumber", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3::"DocumentKind", $4,
             GREATEST($5 + 1, ${highWater}, 1), now())
     ON CONFLICT ("businessId", "financialYearId", "kind") DO NOTHING`,
    businessId,
    fiscalYearId,
    kind,
    prefix,
    consumedOrdinal,
  );

  // Forward-only: GREATEST against the current value means this can only raise
  // the counter, never lower it.
  await db.$executeRawUnsafe(
    `UPDATE "document_sequence" s
        SET "nextNumber" = GREATEST(s."nextNumber", $4 + 1, ${highWater}, 1),
            "updatedAt"  = now()
      WHERE s."businessId" = $1 AND s."financialYearId" = $2 AND s."kind" = $3::"DocumentKind"`,
    businessId,
    fiscalYearId,
    kind,
    consumedOrdinal,
  );
}
