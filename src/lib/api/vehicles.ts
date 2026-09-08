"use client";

import { http } from "@/lib/api-client";
import type { Vehicle } from "@/types";

export interface VehicleBackendInput {
  registrationNumber?: string;
  makeModel?: string;
  vehicleType?: Vehicle["vehicleType"];
  fuelType?: Vehicle["fuelType"];
  manufacturingYear?: number;
  chassisNumber?: string;
  engineNumber?: string;
  assignedRoute?: string;
  driverName?: string;
  driverPhone?: string;
  driverLicense?: string;
  driverLicenseExpiry?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  fcExpiry?: string;
  pucExpiry?: string;
  currentOdometer?: number;
  status?: Vehicle["status"];
  lastServiceDate?: string;
}

export interface VehicleBackendJson {
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
  driverLicenseExpiry: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiry: string | null;
  fcExpiry: string | null;
  pucExpiry: string | null;
  currentOdometer: number;
  status: string;
  lastServiceDate: string | null;
  totalExpenses: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  tollExpenses: number;
  otherExpenses: number;
  createdAt: string;
  updatedAt: string;
}

/** Frontend Vehicle -> backend payload. */
export function toBackendInput(vehicle: Partial<Vehicle>): VehicleBackendInput {
  return {
    registrationNumber: vehicle.registrationNumber || undefined,
    makeModel: vehicle.makeModel || undefined,
    vehicleType: vehicle.vehicleType || undefined,
    fuelType: vehicle.fuelType || undefined,
    manufacturingYear: vehicle.manufacturingYear ?? undefined,
    chassisNumber: vehicle.chassisNumber || undefined,
    engineNumber: vehicle.engineNumber || undefined,
    assignedRoute: vehicle.assignedRoute || undefined,
    driverName: vehicle.driverName || undefined,
    driverPhone: vehicle.driverPhone || undefined,
    driverLicense: vehicle.driverLicense || undefined,
    driverLicenseExpiry: vehicle.driverLicenseExpiry || undefined,
    insurancePolicyNumber: vehicle.insurancePolicyNumber || undefined,
    insuranceExpiry: vehicle.insuranceExpiry || undefined,
    fcExpiry: vehicle.fcExpiry || undefined,
    pucExpiry: vehicle.pucExpiry || undefined,
    currentOdometer: vehicle.currentOdometer ?? undefined,
    status: vehicle.status || undefined,
    lastServiceDate: vehicle.lastServiceDate || undefined,
  };
}

/** Backend VehicleJson -> frontend Vehicle shape (nulls become ""). */
export function fromBackendVehicle(v: VehicleBackendJson): Vehicle {
  return {
    id: v.id,
    registrationNumber: v.registrationNumber,
    makeModel: v.makeModel,
    vehicleType: v.vehicleType as Vehicle["vehicleType"],
    fuelType: v.fuelType as Vehicle["fuelType"],
    manufacturingYear: v.manufacturingYear,
    chassisNumber: v.chassisNumber ?? "",
    engineNumber: v.engineNumber ?? "",
    driverName: v.driverName,
    driverPhone: v.driverPhone,
    driverLicense: v.driverLicense ?? "",
    driverLicenseExpiry: v.driverLicenseExpiry ?? "",
    insurancePolicyNumber: v.insurancePolicyNumber ?? "",
    insuranceExpiry: v.insuranceExpiry ?? "",
    fcExpiry: v.fcExpiry ?? "",
    pucExpiry: v.pucExpiry ?? "",
    currentOdometer: v.currentOdometer,
    status: v.status as Vehicle["status"],
    totalExpenses: v.totalExpenses ?? 0,
    fuelExpenses: v.fuelExpenses ?? 0,
    maintenanceExpenses: v.maintenanceExpenses ?? 0,
    tollExpenses: v.tollExpenses ?? 0,
    otherExpenses: v.otherExpenses ?? 0,
    assignedRoute: v.assignedRoute ?? "",
    lastServiceDate: v.lastServiceDate ?? "",
  };
}

export const vehiclesApi = {
  list: (businessId: string, filters?: { q?: string; status?: string; vehicleType?: string }) => {
    const params = new URLSearchParams();
    if (filters?.q) params.set("q", filters.q);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.vehicleType) params.set("vehicleType", filters.vehicleType);
    const qs = params.toString();
    return http.get<{ vehicles: VehicleBackendJson[] }>(
      qs ? `/api/vehicles?${qs}` : "/api/vehicles",
      { businessId },
    );
  },
  create: (businessId: string, input: VehicleBackendInput) =>
    http.post<{ vehicle: VehicleBackendJson }>("/api/vehicles", input, { businessId }),
  get: (businessId: string, id: string) =>
    http.get<{ vehicle: VehicleBackendJson }>(`/api/vehicles/${id}`, { businessId }),
  update: (businessId: string, id: string, input: Partial<VehicleBackendInput>) =>
    http.patch<{ vehicle: VehicleBackendJson }>(`/api/vehicles/${id}`, input, { businessId }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/vehicles/${id}`, { businessId }),
};