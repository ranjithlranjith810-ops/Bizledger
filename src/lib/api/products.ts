"use client";

import { http } from "@/lib/api-client";
import type { Product } from "@/types";

export const productsApi = {
  list: (businessId: string) =>
    http.get<{ products: Product[] }>("/api/products", { businessId }),
  create: (businessId: string, input: Omit<Product, "id">) =>
    http.post<{ product: Product }>("/api/products", input, { businessId }),
  update: (businessId: string, id: string, patch: Partial<Product>) =>
    http.patch<{ product: Product }>(`/api/products/${id}`, patch, { businessId }),
  remove: (businessId: string, id: string) =>
    http.del<{ id: string }>(`/api/products/${id}`, { businessId }),
};