"use client";

import { http } from "@/lib/api-client";
import type { Expense } from "@/types";

export interface ExpenseBackendInput {
  title: string;
  amount: number;
  date: string;
  expenseNumber?: string;
  category?: Expense["category"];
  paymentMethod?: Expense["paymentMethod"];
  expenseType?: Expense["expenseType"];
  status?: Expense["status"];
  paidFromAccount?: string;
  referenceNumber?: string;
  vendor?: string;
  notes?: string;
  receiptUrl?: string;
  receiptName?: string;
  receiptSize?: string;
  vehicleId?: string;
  vehicleRegistration?: string;
  createdBy?: string;
  approvedBy?: string;
}

export interface ExpenseBackendJson {
  id: string;
  expenseNumber: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  paidFromAccount: string | null;
  referenceNumber: string | null;
  vendor: string;
  expenseType: string;
  status: string;
  notes: string | null;
  receiptUrl: string | null;
  receiptName: string | null;
  receiptSize: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Frontend Expense -> backend payload. */
export function toBackendInput(expense: Omit<Expense, "id" | "createdAt">): ExpenseBackendInput {
  return {
    title: expense.title,
    amount: expense.amount,
    date: expense.date,
    expenseNumber: expense.expenseNumber,
    category: expense.category,
    paymentMethod: expense.paymentMethod,
    expenseType: expense.expenseType,
    status: expense.status,
    paidFromAccount: expense.paidFromAccount || undefined,
    referenceNumber: expense.referenceNumber || undefined,
    vendor: expense.vendor || undefined,
    notes: expense.notes || undefined,
    receiptUrl: expense.receiptUrl || undefined,
    receiptName: expense.receiptName || undefined,
    receiptSize: expense.receiptSize || undefined,
    vehicleId: expense.vehicleId || undefined,
    vehicleRegistration: expense.vehicleRegistration || undefined,
    createdBy: expense.createdBy || undefined,
    approvedBy: expense.approvedBy || undefined,
  };
}

/** Backend ExpenseJson -> frontend Expense shape (nulls become undefined). */
export function fromBackendExpense(e: ExpenseBackendJson): Expense {
  return {
    id: e.id,
    expenseNumber: e.expenseNumber,
    title: e.title,
    category: e.category as Expense["category"],
    amount: e.amount,
    date: e.date,
    paymentMethod: e.paymentMethod as Expense["paymentMethod"],
    paidFromAccount: e.paidFromAccount ?? "Cash",
    referenceNumber: e.referenceNumber ?? undefined,
    vendor: e.vendor ?? undefined,
    expenseType: e.expenseType as Expense["expenseType"],
    status: e.status as Expense["status"],
    notes: e.notes ?? undefined,
    receiptUrl: e.receiptUrl ?? undefined,
    receiptName: e.receiptName ?? undefined,
    receiptSize: e.receiptSize ?? undefined,
    vehicleId: e.vehicleId ?? undefined,
    vehicleRegistration: e.vehicleRegistration ?? undefined,
    createdBy: e.createdBy ?? "",
    approvedBy: e.approvedBy ?? undefined,
    createdAt: e.createdAt,
  };
}

export const expensesApi = {
  list: (businessId: string, filters?: { q?: string; category?: string; paymentMethod?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.q) params.set("q", filters.q);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
    if (filters?.status) params.set("status", filters.status);
    const qs = params.toString();
    return http.get<{ expenses: ExpenseBackendJson[] }>(
      qs ? `/api/expenses?${qs}` : "/api/expenses",
      { businessId },
    );
  },
  create: (businessId: string, input: ExpenseBackendInput) =>
    http.post<{ expense: ExpenseBackendJson }>("/api/expenses", input, { businessId }),
  get: (businessId: string, id: string) =>
    http.get<{ expense: ExpenseBackendJson }>(`/api/expenses/${id}`, { businessId }),
  update: (businessId: string, id: string, input: Partial<ExpenseBackendInput>) =>
    http.patch<{ expense: ExpenseBackendJson }>(`/api/expenses/${id}`, input, { businessId }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/expenses/${id}`, { businessId }),
};