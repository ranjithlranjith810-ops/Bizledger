// Server-side Vehicle service layer (multi-tenant).
//
// SECURITY: Every operation resolves the authenticated user's membership in the
// requested `businessId` (getBusinessForMember) before touching data. All
// queries are scoped to the verified business, so a caller can never read or
// mutate another tenant's vehicles. The `businessId` is a REQUESTED TARGET
// validated against the authenticated user's own BusinessMember.
//
// Field values mirror the frontend (AddVehicleModal): registrationNumber is
// normalized to trim + uppercase, and status/type/fuel are validated against
// the exact frontend value sets (quoted Strings with spaces, Phase 3D
// precedent). Vehicle numbers are unique WITHIN a business.

import { prisma } from "@/lib/prisma";
import { getBusinessForMember } from "@/lib/business/business-service";
import {
  ValidationError,
  ResourceNotFoundError,
  DuplicateResourceError,
} from "@/lib/business/api-error";
import type { Prisma } from "@/generated/prisma/client";

export const VEHICLE_STATUSES = ["Active", "Under Maintenance", "Inactive"] as const;
export const VEHICLE_TYPES = [
  "Mini Truck",
  "Pickup",
  "Truck",
  "Van",
  "Car",
  "Two-Wheeler",
] as const;
export const VEHICLE_FUEL_TYPES = ["Diesel", "Petrol", "CNG", "Electric"] as const;

const MAX_LEN = 500;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function int(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

function invalid(list: readonly string[], value: string, label: string) {
  if (!(list as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
}

/** Normalize an ISO date-only (YYYY-MM-DD) or ISO-8601 string to a Date. */
function isoDate(v: unknown, label: string): Date | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (!DATE_ONLY.test(s) && !/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  const d = new Date(s.length === 10 ? s + "T00:00:00.000Z" : s);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`Invalid ${label}`);
  return d;
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

function normalizeVehicleInput(raw: Record<string, unknown>, partial = false) {
  const get = (k: string) => str(raw[k]);
  const getInt = (k: string) => int(raw[k]);
  const getDate = (k: string) => isoDate(raw[k], k);

  if (!partial) {
    const reg = get("registrationNumber");
    if (!reg) throw new ValidationError("Registration number is required");
    const make = get("makeModel");
    if (!make) throw new ValidationError("Make & model is required");
    const driver = get("driverName");
    if (!driver) throw new ValidationError("Driver name is required");
    const phone = get("driverPhone");
    if (!phone) throw new ValidationError("Driver phone is required");
  }

  const out: Record<string, unknown> = {};
  const reg = get("registrationNumber");
  if (partial) {
    if (reg === "") throw new ValidationError("Registration number cannot be empty");
    if (reg !== undefined) {
      if (reg.length > 64) throw new ValidationError("Registration number is too long");
      out.registrationNumber = reg.toUpperCase();
    }
  } else {
    if (reg !== undefined) {
      if (reg.length > 64) throw new ValidationError("Registration number is too long");
      out.registrationNumber = reg.toUpperCase();
    }
  }

  const make = get("makeModel");
  if (partial) {
    if (make === "") throw new ValidationError("Make & model cannot be empty");
  } else {
    if (!make) throw new ValidationError("Make & model is required");
  }
  if (make !== undefined) {
    if (make.length > MAX_LEN) throw new ValidationError("Make & model is too long");
    out.makeModel = make;
  }

  const vtype = get("vehicleType");
  if (vtype !== undefined) {
    if (vtype.length > 64) throw new ValidationError("Vehicle type is invalid");
    invalid(VEHICLE_TYPES, vtype, "vehicle type");
    out.vehicleType = vtype;
  }

  const fuel = get("fuelType");
  if (fuel !== undefined) {
    if (fuel.length > 64) throw new ValidationError("Fuel type is invalid");
    invalid(VEHICLE_FUEL_TYPES, fuel, "fuel type");
    out.fuelType = fuel;
  }

  const year = getInt("manufacturingYear");
  if (year !== undefined) {
    if (year < 1950 || year > 2100) {
      throw new ValidationError("Manufacturing year is invalid");
    }
    out.manufacturingYear = year;
  }

  const odo = getInt("currentOdometer");
  if (odo !== undefined) {
    if (odo < 0) throw new ValidationError("Odometer cannot be negative");
    out.currentOdometer = odo;
  }

  const status = get("status");
  if (status !== undefined) {
    invalid(VEHICLE_STATUSES, status, "vehicle status");
    out.status = status;
  }

  for (const k of [
    "chassisNumber",
    "engineNumber",
    "assignedRoute",
    "driverName",
    "driverPhone",
    "driverLicense",
    "insurancePolicyNumber",
  ]) {
    const v = get(k);
    if (v !== undefined) {
      if (v.length > MAX_LEN) throw new ValidationError(`${k} is too long`);
      out[k] = v;
    }
  }

  for (const k of [
    "driverLicenseExpiry",
    "insuranceExpiry",
    "fcExpiry",
    "pucExpiry",
    "lastServiceDate",
  ]) {
    const d = getDate(k);
    if (d !== undefined) out[k] = d;
  }

  if (!partial) {
    out.vehicleType = (out.vehicleType as string) ?? "Mini Truck";
    out.fuelType = (out.fuelType as string) ?? "Diesel";
    out.manufacturingYear = (out.manufacturingYear as number) ?? new Date().getFullYear();
    out.currentOdometer = (out.currentOdometer as number) ?? 0;
    out.status = (out.status as string) ?? "Active";
    const dm = out.driverName !== undefined ? str(out.driverName) : undefined;
    const dp = out.driverPhone !== undefined ? str(out.driverPhone) : undefined;
    if (dm) out.driverName = dm;
    if (dp) out.driverPhone = dp;
  }

  // Build a plain (non-Prisma-input) object with only the accepted keys, then
  // cast to the Prisma unchecked input at the call site. This avoids the
  // relation-shaped `Prisma.VehicleXxxInput` types that would otherwise expose
  // the `expenses`/`business` relation fields here.
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) if (v !== undefined) clean[k] = v;
  return {
    registrationNumber: clean.registrationNumber as string | undefined,
    makeModel: clean.makeModel as string | undefined,
    vehicleType: clean.vehicleType as string | undefined,
    fuelType: clean.fuelType as string | undefined,
    manufacturingYear: clean.manufacturingYear as number | undefined,
    currentOdometer: clean.currentOdometer as number | undefined,
    status: clean.status as string | undefined,
    chassisNumber: clean.chassisNumber as string | undefined,
    engineNumber: clean.engineNumber as string | undefined,
    assignedRoute: clean.assignedRoute as string | undefined,
    driverName: clean.driverName as string | undefined,
    driverPhone: clean.driverPhone as string | undefined,
    driverLicense: clean.driverLicense as string | undefined,
    driverLicenseExpiry: clean.driverLicenseExpiry as Date | undefined,
    insurancePolicyNumber: clean.insurancePolicyNumber as string | undefined,
    insuranceExpiry: clean.insuranceExpiry as Date | undefined,
    fcExpiry: clean.fcExpiry as Date | undefined,
    pucExpiry: clean.pucExpiry as Date | undefined,
    lastServiceDate: clean.lastServiceDate as Date | undefined,
  };
}

function toVehicleJson(v: {
  id: string;
  registrationNumber: string;
  makeModel: string;
  vehicleType: string;
  fuelType: string;
  manufacturingYear: number;
  chassisNumber: string | null;
  engineNumber: string | null;
  assignedRoute: string | null;
  driverName: string;
  driverPhone: string;
  driverLicense: string | null;
  driverLicenseExpiry: Date | null;
  insurancePolicyNumber: string | null;
  insuranceExpiry: Date | null;
  fcExpiry: Date | null;
  pucExpiry: Date | null;
  currentOdometer: number;
  status: string;
  lastServiceDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    id: v.id,
    registrationNumber: v.registrationNumber,
    makeModel: v.makeModel,
    vehicleType: v.vehicleType,
    fuelType: v.fuelType,
    manufacturingYear: v.manufacturingYear,
    chassisNumber: v.chassisNumber,
    engineNumber: v.engineNumber,
    assignedRoute: v.assignedRoute,
    driverName: v.driverName,
    driverPhone: v.driverPhone,
    driverLicense: v.driverLicense,
    driverLicenseExpiry: iso(v.driverLicenseExpiry),
    insurancePolicyNumber: v.insurancePolicyNumber,
    insuranceExpiry: iso(v.insuranceExpiry),
    fcExpiry: iso(v.fcExpiry),
    pucExpiry: iso(v.pucExpiry),
    currentOdometer: v.currentOdometer,
    status: v.status,
    lastServiceDate: iso(v.lastServiceDate),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

// Expense-derived aggregates (Phase 3H): the DB is the single source of truth —
// sums of the member's Expense rows linked to each vehicle. Category buckets
// match the expense category set: "Fuel", "Maintenance", everything else.
// There is no dedicated "Toll" category in the scheme, so tollExpenses is
// reported as 0 and such spend falls under otherExpenses.
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface VehicleExpenseTotals {
  totalExpenses: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  tollExpenses: number;
  otherExpenses: number;
}

const emptyTotals = (): VehicleExpenseTotals => ({
  totalExpenses: 0,
  fuelExpenses: 0,
  maintenanceExpenses: 0,
  tollExpenses: 0,
  otherExpenses: 0,
});

async function vehicleExpenseTotals(
  businessId: string,
  vehicleIds: string[],
): Promise<Map<string, VehicleExpenseTotals>> {
  const map = new Map<string, VehicleExpenseTotals>();
  for (const id of vehicleIds) map.set(id, emptyTotals());
  if (vehicleIds.length === 0) return map;

  const rows = await prisma.expense.groupBy({
    by: ["vehicleId", "category"],
    where: { businessId, vehicleId: { in: vehicleIds } },
    _sum: { amount: true },
  });

  for (const row of rows) {
    if (!row.vehicleId) continue;
    const entry = map.get(row.vehicleId);
    if (!entry) continue;
    const amount = Number(row._sum?.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    entry.totalExpenses += amount;
    if (row.category === "Fuel") entry.fuelExpenses += amount;
    else if (row.category === "Maintenance") entry.maintenanceExpenses += amount;
    else entry.otherExpenses += amount;
  }

  for (const entry of map.values()) {
    entry.totalExpenses = r2(entry.totalExpenses);
    entry.fuelExpenses = r2(entry.fuelExpenses);
    entry.maintenanceExpenses = r2(entry.maintenanceExpenses);
    entry.otherExpenses = r2(entry.otherExpenses);
  }
  return map;
}

function toVehicleJsonWithTotals(
  v: Parameters<typeof toVehicleJson>[0],
  totals: VehicleExpenseTotals,
) {
  return {
    ...toVehicleJson(v),
    ...totals,
  };
}

export async function createVehicle(businessIdInput: unknown, raw: Record<string, unknown>) {
  const businessId = validateBusinessId(businessIdInput);
  await getBusinessForMember(businessId);
  const data = normalizeVehicleInput(raw);
  try {
    const created = await prisma.vehicle.create({
      data: {
        businessId,
        ...(data as Omit<Prisma.VehicleUncheckedCreateInput, "businessId">),
      },
    });
    return toVehicleJson(created);
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new DuplicateResourceError("A vehicle with this registration number already exists");
    }
    throw error;
  }
}

export async function listVehicles(
  businessIdInput: unknown,
  opts: { q?: string; status?: string; vehicleType?: string },
) {
  const businessId = validateBusinessId(businessIdInput);
  await getBusinessForMember(businessId);

  const where: Prisma.VehicleWhereInput = { businessId };
  const q = String(opts?.q ?? "").trim().toLowerCase();
  if (q) {
    where.OR = [
      { registrationNumber: { contains: q, mode: "insensitive" } },
      { makeModel: { contains: q, mode: "insensitive" } },
      { driverName: { contains: q, mode: "insensitive" } },
      { driverPhone: { contains: q, mode: "insensitive" } },
    ];
  }
  const status = String(opts?.status ?? "").trim();
  if (status && status !== "All") {
    invalid(VEHICLE_STATUSES, status, "vehicle status");
    where.status = status;
  }
  const vtype = String(opts?.vehicleType ?? "").trim();
  if (vtype && vtype !== "All") {
    invalid(VEHICLE_TYPES, vtype, "vehicle type");
    where.vehicleType = vtype;
  }

  const rows = await prisma.vehicle.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { registrationNumber: "asc" }],
  });
  const totals = await vehicleExpenseTotals(
    businessId,
    rows.map((v) => v.id),
  );
  return rows.map((v) => toVehicleJsonWithTotals(v, totals.get(v.id) ?? emptyTotals()));
}

export async function getVehicle(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await getBusinessForMember(businessId);

  const vehicle = await prisma.vehicle.findFirst({ where: { id, businessId } });
  if (!vehicle) throw new ResourceNotFoundError("Vehicle not found");
  const totalsMap = await vehicleExpenseTotals(businessId, [id]);
  return toVehicleJsonWithTotals(vehicle, totalsMap.get(id) ?? emptyTotals());
}

export async function updateVehicle(
  businessIdInput: unknown,
  idInput: unknown,
  raw: Record<string, unknown>,
) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await getBusinessForMember(businessId);

  const existing = await prisma.vehicle.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Vehicle not found");

  const data = normalizeVehicleInput(raw, true);
  try {
    const updated = await prisma.vehicle.update({ where: { id }, data });
    return toVehicleJson(updated);
  } catch (error) {
    if (isDuplicateError(error)) {
      throw new DuplicateResourceError("A vehicle with this registration number already exists");
    }
    throw error;
  }
}

export async function deleteVehicle(businessIdInput: unknown, idInput: unknown) {
  const businessId = validateBusinessId(businessIdInput);
  const id = validateId(idInput);
  await getBusinessForMember(businessId);

  const existing = await prisma.vehicle.findFirst({ where: { id, businessId } });
  if (!existing) throw new ResourceNotFoundError("Vehicle not found");

  await prisma.vehicle.delete({ where: { id } });
  return { id };
}