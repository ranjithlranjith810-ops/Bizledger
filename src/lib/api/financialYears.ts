"use client";

import { http } from "@/lib/api-client";
import type { FinancialYearSettings } from "@/types";

export interface FinancialYearBackend {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export function toFrontend(fy: FinancialYearBackend): FinancialYearSettings {
  return { id: fy.id, name: fy.name, startDate: fy.startDate, endDate: fy.endDate };
}

export const financialYearsApi = {
  list: (businessId: string) =>
    http.get<{ financialYears: FinancialYearBackend[] }>("/api/financial-years", { businessId }),
  create: (businessId: string, input: Omit<FinancialYearSettings, "id">) =>
    http.post<{ financialYear: FinancialYearBackend }>("/api/financial-years", input, { businessId }),
  activate: (businessId: string, id: string) =>
    http.post<{ financialYear: FinancialYearBackend }>(`/api/financial-years/${id}/activate`, {}, { businessId }),
};