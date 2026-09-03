"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { PurchaseOrdersList } from "@/components/purchaseOrders/PurchaseOrdersList";
import { AddPurchaseOrderModal } from "@/components/purchaseOrders/AddPurchaseOrderModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function PurchaseOrdersPage() {
  const { openModal } = useApp();

  return (
    <>
      <PurchaseOrdersList />
      {openModal === "add-purchase-order" && <AddPurchaseOrderModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}