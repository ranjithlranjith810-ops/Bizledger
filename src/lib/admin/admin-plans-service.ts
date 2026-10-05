// Step 5A/5B — Platform Admin plan catalog service (admin backend surface).
//
// BOUNDARY: The Admin UI's localStorage plan catalog is never authoritative for
// anything that reaches this service — pricing/limits are read STRICTLY from
// `plan_catalog` (PlanCatalog), never from src/lib/plans.ts, never from any
// client-supplied value. This module is the write surface for plan management:
//
//   Authorization (server-side, resolved from the session at every call):
//     - anonymous                              -> 401 (requireUser)
//     - signed-in non-admin                    -> 403 (ForbiddenError)
//     - SUPPORT_ADMIN                          -> 403 for writes (SUPER_ADMIN only)
//     - SUPER_ADMIN                            -> allowed
//
//   Writable fields (POST create requires all 8; PATCH applies any subset):
//     name | description | price | period | businessNetworkIncluded | limits |
//     featureEntitlements (optional on create — defaults to NULL) | active
//     - `id`/`createdAt`/`updatedAt` and any other key are REJECTED (400).
//
//   Never mutate historical records:
//     - PaymentRecord amounts / BillingInvoice amounts / BusinessSubscription
//       planSnapshot are never written here. Only the PlanCatalog row changes;
//       checkout reads PlanCatalog fresh server-side, so deactivation affects
//       FUTURE plan selection only and existing subscriptions keep their stored
//       subscription state.

import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { FREE_PLAN_ID } from "@/lib/plans";
import {
  validatePeriod,
  BillingPeriodError,
  type BillingPeriod,
} from "@/lib/billing/calculator";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
  ConflictError,
} from "@/lib/business/api-error";
import { requirePlatformAdminRole } from "@/lib/directory/directory-admin-service";
import {
  MAX_REASON_LENGTH,
  writePlatformAdminLog,
} from "@/lib/admin/admin-audit-service";

/**
 * Safe DTO for the Admin plans view. Deliberately NOT a raw Prisma row: only
 * catalog fields surfaced to the Admin UI, no relations, no subscription/
 * payment history, no secrets. `price` follows the billing convention (plain
 * number — exact for catalog values). `limits` is the plan's persisted
 * entitlements object. `createdAt`/`updatedAt` are the catalog row's own
 * timestamps (ISO strings) — surfaced read-only, never client-writable.
 */
export interface AdminPlanDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  period: string;
  businessNetworkIncluded: boolean;
  limits: Record<string, unknown>;
  featureEntitlements: Record<string, boolean | number | "Unlimited"> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const WRITABLE_FIELDS = [
  "name",
  "description",
  "price",
  "period",
  "businessNetworkIncluded",
  "limits",
  "featureEntitlements",
  "active",
] as const;

// The canonical entitlement keys (EntitlementLimitKind / SubscriptionPlan.
// limits in @/types). No other key is accepted — the admin UI cannot invent
// new entitlement semantics. Values are non-negative integers or "Unlimited".
const KNOWN_LIMIT_KEYS = [
  "customers",
  "teamMembers",
  "products",
  "invoicesPerMonth",
  "estimatesPerMonth",
  "quotationsPerMonth",
  "purchaseOrdersPerMonth",
  "directoryListings",
] as const;

const MAX_PRICE = 9_999_999_999.99; // Decimal(12,2) upper bound
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_FEATURE_KEY_LENGTH = 64;
const MAX_FEATURE_KEYS = 64;
const MAX_FEATURE_PAYLOAD = 16_384; // chars (JSONB-safe upper bound)

const FEATURE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAdminPlanDto(row: {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  period: string;
  businessNetworkIncluded: boolean;
  limits: unknown;
  featureEntitlements: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminPlanDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    period: row.period,
    businessNetworkIncluded: row.businessNetworkIncluded,
    limits: row.limits as Record<string, unknown>,
    featureEntitlements:
      row.featureEntitlements === null || row.featureEntitlements === undefined
        ? null
        : (row.featureEntitlements as Record<string, boolean | number | "Unlimited">),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// JSON-safe, credential-free snapshot of a PlanCatalog row for the audit trail
// (before/after). Catalog fields only — never relations, never DB metadata,
// never secrets. writePlatformAdminLog re-sanitizes on write.
function planAuditSnapshot(row: {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  period: string;
  businessNetworkIncluded: boolean;
  limits: unknown;
  featureEntitlements: unknown;
  active: boolean;
}): Prisma.InputJsonValue {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    period: row.period,
    businessNetworkIncluded: row.businessNetworkIncluded,
    limits: row.limits,
    featureEntitlements:
      row.featureEntitlements === null || row.featureEntitlements === undefined
        ? null
        : row.featureEntitlements,
    active: row.active,
  } as Prisma.InputJsonValue;
}

// Optional reason (create/update/delete convention): validated when present,
// trimmed to null when blank, bounded to MAX_REASON_LENGTH.
function parseOptionalReason(reasonInput: unknown): string | null {
  if (reasonInput === undefined || reasonInput === null) return null;
  if (typeof reasonInput !== "string") {
    throw new ValidationError("reason must be a string");
  }
  const trimmed = reasonInput.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`);
  }
  return trimmed;
}

// Required reason for activating/deactivating a plan — mirrors the business
// suspend/reactivate convention: the mutation is refused without a reason.
function parseRequiredReason(reasonInput: unknown, verb: string): string {
  if (typeof reasonInput !== "string" || reasonInput.trim().length === 0) {
    throw new ValidationError(`${verb} requires a reason`);
  }
  const trimmed = reasonInput.trim();
  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer`);
  }
  return trimmed;
}

function validateName(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("name is required");
  const name = value.trim();
  if (!name) throw new ValidationError("name must not be empty");
  if (name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  return name;
}

function validateDescription(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError("description must be a string or null");
  }
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
  }
  return description === "" ? null : description;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError("price must be a non-negative number");
  }
  // 2-decimal precision in exact integer-safe terms — never via float math.
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) {
    throw new ValidationError("price must have at most 2 decimal places");
  }
  if (value > MAX_PRICE) throw new ValidationError("price is out of range");
  return value;
}

function validatePeriodValue(value: unknown): BillingPeriod {
  try {
    return validatePeriod(value);
  } catch (error) {
    if (error instanceof BillingPeriodError) {
      throw new ValidationError("period must be 'month' or 'year'");
    }
    throw error;
  }
}

function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be a boolean`);
  return value;
}

// Limits must preserve the existing PlanCatalog structure exactly: the full
// canonical key set, each a non-negative integer or the string "Unlimited".
function validateLimits(value: unknown): Record<string, number | "Unlimited"> {
  if (!isPlainObject(value)) throw new ValidationError("limits must be an object");
  for (const key of Object.keys(value)) {
    if (!(KNOWN_LIMIT_KEYS as readonly string[]).includes(key)) {
      throw new ValidationError(`unknown limit key: ${key}`);
    }
  }
  const limits: Record<string, number | "Unlimited"> = {};
  for (const key of KNOWN_LIMIT_KEYS) {
    const entry = value[key];
    if (
      entry !== "Unlimited" &&
      !(typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 9_999_999)
    ) {
      throw new ValidationError(`limit ${key} must be a non-negative integer or "Unlimited"`);
    }
    limits[key] = entry as number | "Unlimited";
  }
  return limits;
}

/** Reject unknown/unsafe top-level fields, including id/createdAt/updatedAt. */
function assertNoUnknownFields(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) {
    if (!(WRITABLE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`unknown field: ${key}`);
    }
  }
}

/**
 * Feature entitlements: an OPTIONAL, purely administrative free-form flag map
 * (e.g. `{ "businessDirectory": true, "advancedReports": false }`) that is NOT
 * yet wired into customer billing behavior — Phase 9C-1 prepares the schema and
 * validation only. Rules:
 *   - null / absent            -> stored as SQL NULL (feature flags off)
 *   - must be a plain JSON object (arrays rejected)
 *   - keys: non-empty safe identifiers ([A-Za-z_][A-Za-z0-9_], <=64 chars) —
 *     HTML/script/tag-ish keys are rejected outright
 *   - values: boolean | non-negative integer | "Unlimited" only (nested objects
 *     and internal nulls rejected)
 *   - bounded payload: <= 64 keys, <= 16KB serialized
 */
function validateFeatureEntitlements(
  value: unknown,
): Record<string, boolean | number | "Unlimited"> | null {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) {
    throw new ValidationError("featureEntitlements must be an object or null");
  }
  if (JSON.stringify(value).length > MAX_FEATURE_PAYLOAD) {
    throw new ValidationError("featureEntitlements is too large");
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_FEATURE_KEYS) {
    throw new ValidationError(`featureEntitlements supports at most ${MAX_FEATURE_KEYS} features`);
  }
  const out: Record<string, boolean | number | "Unlimited"> = {};
  for (const key of keys) {
    if (!FEATURE_KEY_RE.test(key)) {
      throw new ValidationError(`invalid feature key: ${JSON.stringify(key)}`);
    }
    const entry = value[key];
    if (entry === null) {
      throw new ValidationError(`feature "${key}" must not be null`);
    }
    if (typeof entry === "boolean") {
      out[key] = entry;
      continue;
    }
    if (entry === "Unlimited") {
      out[key] = entry;
      continue;
    }
    if (
      typeof entry === "number" &&
      Number.isInteger(entry) &&
      entry >= 0 &&
      entry <= 9_999_999
    ) {
      out[key] = entry;
      continue;
    }
    throw new ValidationError(
      `feature "${key}" must be a boolean, non-negative integer, or "Unlimited"`,
    );
  }
  return out;
}

interface PlanWriteFields {
  name?: string;
  description?: string | null;
  price?: number;
  period?: BillingPeriod;
  businessNetworkIncluded?: boolean;
  limits?: Record<string, number | "Unlimited">;
  featureEntitlements?: Record<string, boolean | number | "Unlimited"> | null;
  active?: boolean;
}

// Validates and returns the writable fields. `requireAll` (POST) demands every
// writable key; PATCH validates only the keys that are present.
function parsePlanWriteFields(body: unknown, opts: { requireAll: boolean }): PlanWriteFields {
  if (!isPlainObject(body)) throw new ValidationError("request body must be a JSON object");
  assertNoUnknownFields(body);

  const out: PlanWriteFields = {};
  if ("name" in body || opts.requireAll) out.name = validateName(body.name);
  if ("description" in body || opts.requireAll) {
    out.description = validateDescription(body.description);
  }
  if ("price" in body || opts.requireAll) out.price = validatePrice(body.price);
  if ("period" in body || opts.requireAll) out.period = validatePeriodValue(body.period);
  if ("businessNetworkIncluded" in body || opts.requireAll) {
    out.businessNetworkIncluded = validateBoolean(body.businessNetworkIncluded, "businessNetworkIncluded");
  }
  if ("limits" in body || opts.requireAll) out.limits = validateLimits(body.limits);
  if ("featureEntitlements" in body || opts.requireAll) {
    out.featureEntitlements = validateFeatureEntitlements(body.featureEntitlements);
  }
  if ("active" in body || opts.requireAll) out.active = validateBoolean(body.active, "active");

  if (Object.keys(out).length === 0) throw new ValidationError("no writable fields provided");
  return out;
}

/**
 * App-layer duplicate-name guard. NOTE: there is NO unique constraint on
 * plan_catalog.name in the schema (current behavior allows duplicates at the
 * DB level); this check prevents accidental duplicate catalog names without
 * adding a schema constraint.
 */
async function ensureUniquePlanName(name: string, excludeId?: string): Promise<void> {
  const duplicate = await prisma.planCatalog.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, NOT: excludeId ? { id: excludeId } : undefined },
    select: { id: true },
  });
  if (duplicate) throw new DuplicateResourceError("A plan with this name already exists");
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === code
  );
}

/**
 * Lists the ENTIRE PlanCatalog for platform admins — including inactive plans
 * (admins need to see what is soft-disabled). Both SUPER_ADMIN and
 * SUPPORT_ADMIN may read; SUPPORT_ADMIN is the restricted tier everywhere
 * writes land. Deterministic sort: price ascending, then stable plan id.
 */
export async function listAdminPlans(): Promise<AdminPlanDto[]> {
  await requirePlatformAdminRole("SUPPORT_ADMIN");

  const rows = await prisma.planCatalog.findMany({
    orderBy: [{ price: "asc" }, { id: "asc" }],
  });

  return rows.map(toAdminPlanDto);
}

/**
 * POST /api/admin/plans — create a plan. SUPER_ADMIN only. The id is generated
 * server-side; the browser never supplies id/createdAt/updatedAt or any field
 * outside the 8 writable ones. `featureEntitlements` may be omitted (stored as
 * SQL NULL); every other writable field is required and validated.
 */
export async function createAdminPlan(raw: unknown): Promise<AdminPlanDto> {
  await requirePlatformAdminRole("SUPER_ADMIN");

  const fields = parsePlanWriteFields(raw, { requireAll: true });
  await ensureUniquePlanName(fields.name as string);

  const id = `plan_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.planCatalog.create({
        data: {
          id,
          name: fields.name as string,
          description: fields.description ?? null,
          price: fields.price as number,
          period: fields.period as BillingPeriod,
          businessNetworkIncluded: fields.businessNetworkIncluded as boolean,
          limits: fields.limits as unknown as Prisma.InputJsonValue,
          featureEntitlements:
            fields.featureEntitlements === null || fields.featureEntitlements === undefined
              ? Prisma.DbNull
              : (fields.featureEntitlements as unknown as Prisma.InputJsonValue),
          active: fields.active as boolean,
        },
      });

      // Phase 9C-2: PLAN_CREATE audit in the SAME transaction — the plan row
      // and its audit row commit together; an audit failure rolls both back.
      await writePlatformAdminLog(
        {
          action: "PLAN_CREATE",
          targetType: "plan",
          targetId: created.id,
          reason: null,
          after: planAuditSnapshot(created),
        },
        { tx, minRole: "SUPER_ADMIN" },
      );

      return created;
    });
    return toAdminPlanDto(row);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new ConflictError("A plan with this id already exists");
    }
    throw error;
  }
}

/**
 * PATCH /api/admin/plans/[id] — update a plan. SUPER_ADMIN only. Applies any
 * subset of the writable fields; unknown fields / bad values are 400. Only the
 * PlanCatalog row changes — historical PaymentRecord amounts,
 * BusinessSubscription.planSnapshot and BillingInvoice amounts are never
 * modified. The FREE (base) plan cannot be deactivated.
 */
export async function updateAdminPlan(id: string, raw: unknown): Promise<AdminPlanDto> {
  await requirePlatformAdminRole("SUPER_ADMIN");

  if (!id) throw new ValidationError("plan id is required");

  const existing = await prisma.planCatalog.findUnique({ where: { id } });
  if (!existing) throw new ResourceNotFoundError("Plan not found");

  if (!isPlainObject(raw)) throw new ValidationError("request body must be a JSON object");
  const { reason: rawReason, ...writableBody } = raw;
  const fields = parsePlanWriteFields(writableBody, { requireAll: false });

  if (fields.active === false && id === FREE_PLAN_ID) {
    throw new ConflictError("The free plan cannot be deactivated");
  }

  // Explicit-patch semantics: only active transitions demand the audit
  // activate/deactivate action AND a mandatory reason; plain field edits use
  // PLAN_UPDATE with an optional reason.
  const togglingActive = fields.active !== undefined && fields.active !== existing.active;
  let reason: string | null = null;
  let action: "PLAN_UPDATE" | "PLAN_ACTIVATE" | "PLAN_DEACTIVATE" = "PLAN_UPDATE";
  if (togglingActive) {
    reason = fields.active
      ? parseRequiredReason(rawReason, "Activating a plan")
      : parseRequiredReason(rawReason, "Deactivating a plan");
    action = fields.active ? "PLAN_ACTIVATE" : "PLAN_DEACTIVATE";
  } else if (rawReason !== undefined) {
    reason = parseOptionalReason(rawReason);
  }

  if (fields.name !== undefined) await ensureUniquePlanName(fields.name, id);

  const data: Prisma.PlanCatalogUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.price !== undefined) data.price = fields.price;
  if (fields.period !== undefined) data.period = fields.period;
  if (fields.businessNetworkIncluded !== undefined) {
    data.businessNetworkIncluded = fields.businessNetworkIncluded;
  }
  if (fields.limits !== undefined) data.limits = fields.limits as unknown as Prisma.InputJsonValue;
  if (fields.featureEntitlements !== undefined) {
    data.featureEntitlements =
      fields.featureEntitlements === null
        ? Prisma.DbNull
        : (fields.featureEntitlements as unknown as Prisma.InputJsonValue);
  }
  if (fields.active !== undefined) data.active = fields.active;

  const before = planAuditSnapshot(existing);

  // Phase 9C-2: update + audit (PLAN_UPDATE / PLAN_ACTIVATE / PLAN_DEACTIVATE)
  // in ONE transaction — audit failure rolls the catalog change back.
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.planCatalog.update({ where: { id }, data });

    await writePlatformAdminLog(
      {
        action,
        targetType: "plan",
        targetId: id,
        reason,
        before,
        after: planAuditSnapshot(updated),
      },
      { tx, minRole: "SUPER_ADMIN" },
    );

    return updated;
  });

  return toAdminPlanDto(row);
}

/**
 * DELETE /api/admin/plans/[id] — delete a plan. SUPER_ADMIN only. The FREE
 * (base) plan is protected. To keep history immutable, the deletion refuses
 * (409) a plan referenced by any subscription, payment or billing-invoice
 * row — reference checking and the delete run in ONE transaction with the
 * PLAN_DELETE audit row (an audit failure rolls back the deletion). The FK
 * (onDelete: Restrict) remains the last line of defense; there is no cascade.
 */
export async function deleteAdminPlan(
  id: string,
  rawReason?: unknown,
): Promise<{ deleted: true; id: string }> {
  await requirePlatformAdminRole("SUPER_ADMIN");

  if (!id) throw new ValidationError("plan id is required");
  if (id === FREE_PLAN_ID) throw new ConflictError("The free plan cannot be deleted");

  const existing = await prisma.planCatalog.findUnique({ where: { id } });
  if (!existing) throw new ResourceNotFoundError("Plan not found");

  const reason = parseOptionalReason(rawReason);
  const before = planAuditSnapshot(existing);

  try {
    await prisma.$transaction(async (tx) => {
      const [subscriptionRefs, paymentRefs, invoiceRefs] = await Promise.all([
        tx.businessSubscription.count({ where: { planId: id } }),
        tx.paymentRecord.count({ where: { planId: id } }),
        tx.billingInvoice.count({ where: { planId: id } }),
      ]);
      // Historical records keep the plan intact — a 409, never a cascade wipe.
      if (subscriptionRefs + paymentRefs + invoiceRefs > 0) {
        throw new ConflictError(
          "Plan cannot be deleted while it is referenced by subscriptions or payments",
        );
      }

      await tx.planCatalog.delete({ where: { id } });

      await writePlatformAdminLog(
        { action: "PLAN_DELETE", targetType: "plan", targetId: id, reason, before },
        { tx, minRole: "SUPER_ADMIN" },
      );
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      throw new ConflictError(
        "Plan cannot be deleted while it is referenced by subscriptions or payments",
      );
    }
    throw error;
  }

  return { deleted: true, id };
}