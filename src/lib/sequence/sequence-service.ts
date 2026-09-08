// Server-side DocumentSequence service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (via getBusinessForMember) and verifies the target
// financial year belongs to that same business. A caller can never allocate a
// number against another tenant's business or financial year.
//
// ALLOCATION IS ATOMIC: never SELECT-then-increment in JavaScript (a race would
// hand out duplicate numbers under concurrency). Instead we (1) ensure the
// per-(business, financialYear, kind) row exists via INSERT ... ON CONFLICT DO
// NOTHING, then (2) UPDATE ... RETURNING nextNumber - 1 which takes a row lock
// and returns the pre-increment (already-allocated) number while advancing the
// counter in the same atomic statement. This matches the frontend `nextSequence`
// semantics (returns the next unused number) exactly.

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

  // (2) Atomically take one number via row lock + RETURNING.
  const rows = await db.$queryRawUnsafe<{ allocated: bigint }[]>(
    `UPDATE "document_sequence"
        SET "nextNumber" = "nextNumber" + 1
      WHERE "businessId" = $1 AND "financialYearId" = $2 AND "kind" = $3::"DocumentKind"
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
