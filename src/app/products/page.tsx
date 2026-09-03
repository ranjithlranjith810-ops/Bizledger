"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { ProductsListView } from "@/components/products/ProductsListView";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function ProductsPage() {
  const { openModal } = useApp();

  return (
    <>
      <ProductsListView />
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}
