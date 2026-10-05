// Phase 4A billing — PlanCatalog read service + safe seed helper.
//
// PLAN CATALOG PRINCIPLE:
//   src/lib/plans.ts (PLAN_CATALOG) remains the product-definition source of
//   truth. `plan_catalog` is its persistent, server-side mirror — the backing
//   data for billing APIs. Plan IDs are stable (base | business | enterprise)
//   and are NEVER renamed. This module must not invent a second catalog.
//
// SAFETY:
//   syncPlanCatalog() is idempotent (upsert) and never deletes/deactivates
//   plans or touches subscription/payment history. The catalog is read-only to
//   normal clients (GET /api/billing/plans); there is NO plan mutation API in
//   Phase 4A — plans are application-controlled.

import "server-only";

import { prisma } from "@/lib/prisma";
import { PLAN_CATALOG } from "@/lib/plans";
import { catalogLimits } from "@/lib/billing/entitlements-server";
import type { Prisma } from "@/generated/prisma/client";

/**
 * DTO exposed to the pricing UI. Deliberately NOT a raw Prisma row: no
 * relation objects, no internal database metadata, no subscription/payment
 * history. Price is surfaced as a plain number (0/999/1999 — exact in these
 * values); money is NEVER converted back through float at persistence time.
 */
export interface PlanDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  period: string;
  businessNetworkIncluded: boolean;
  limits: Record<string, unknown>;
}

/**
 * Single DTO mapper for a PlanCatalog row. The ONLY place a database row is
 * converted to a response DTO — raw PlanCatalog records never leave the
 * service layer. Deliberately no relations, DB metadata, timestamps,
 * subscription/payment history or internal ids.
 *
 * `limits` is NOT the raw persisted JSON: it goes through the shared
 * `catalogLimits` resolver (the same one the entitlement engine enforces), so
 * catalog rows written before the document kinds existed still advertise the
 * document limits — they inherit `invoicesPerMonth`, the common four-document
 * ceiling. The pricing page therefore displays exactly what the server enforces.
 */
export async function toPlanDto(row: {
  id: string;
  name: string;
  description: string | null;
  price: unknown;
  period: string;
  businessNetworkIncluded: boolean;
  limits: unknown;
}): Promise<PlanDto> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    period: row.period,
    businessNetworkIncluded: row.businessNetworkIncluded,
    limits: catalogLimits(row),
  };
}

/**
 * Internal (server-only) billing lookup of a single ACTIVE plan. Returns the
 * plan with its RAW persisted Decimal `price` so checkout can calculate
 * EXACTLY from PlanCatalog — never from a Number conversion or a client value.
 * This narrow shape is NOT a response DTO and must never cross the HTTP
 * boundary; it is consumed only by server-side billing services.
 */
export interface BillingPlanRow {
  id: string;
  name: string;
  price: Prisma.Decimal;
  period: string;
  businessNetworkIncluded: boolean;
  limits: unknown;
}

/**
 * Fetches a single ACTIVE plan for server-side billing math.
 *
 * @returns the internal plan row, or `null` when the id does not exist or the
 *   plan is not active (indistinguishable on purpose, matching the public DTO.
 */
export async function getActivePlanForBilling(id: string): Promise<BillingPlanRow | null> {
  if (!id) return null;
  const row = await prisma.planCatalog.findFirst({
    where: { id, active: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    period: row.period,
    businessNetworkIncluded: row.businessNetworkIncluded,
    limits: row.limits,
  };
}

/**
 * Fetches a single ACTIVE plan as a safe DTO.
 *
 * @returns the DTO, or `null` when the id does not exist or the plan is not
 *   active. Callers map `null` to their API's not-found convention (404) —
 *   inactive and unknown plans are indistinguishable on purpose.
 */
export async function getActivePlanById(id: string): Promise<PlanDto | null> {
  if (!id) return null;
  const row = await prisma.planCatalog.findFirst({
    where: { id, active: true },
  });
  if (!row) return null;
  return toPlanDto(row);
}

/**
 * Idempotently synchronizes the PLAN_CATALOG source rows into plan_catalog via
 * upsert. Safe to run more than once — duplicate rows are impossible. Only the
 * known catalog fields are written; nothing else is touched. Never deletes
 * plans, never deactivates unexpected plans, never touches billing history.
 */
export async function syncPlanCatalog(): Promise<{ synced: number; plans: string[] }> {
  const plans: string[] = [];

  for (const plan of PLAN_CATALOG) {
    await prisma.planCatalog.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        period: plan.period,
        businessNetworkIncluded: plan.businessNetworkIncluded,
        limits: plan.limits as unknown as object,
        active: true,
      },
      update: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        period: plan.period,
        businessNetworkIncluded: plan.businessNetworkIncluded,
        limits: plan.limits as unknown as object,
        active: true,
      },
    });
    plans.push(plan.id);
  }

  return { synced: plans.length, plans };
}

/**
 * Reads the active plan catalog as DTOs. The catalog is platform data, NOT
 * tenant-scoped — authentication is enforced by the route layer.
 */
export async function listPlans(
  opts: { activeOnly?: boolean } = {}
): Promise<PlanDto[]> {
  const rows = await prisma.planCatalog.findMany({
    where: opts.activeOnly ? { active: true } : undefined,
    orderBy: [{ price: "asc" }, { id: "asc" }],
  });

  const plans: PlanDto[] = [];
  for (const row of rows) {
    plans.push(await toPlanDto(row));
  }
  return plans;
}