"use client";

import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { PurchaseOrdersList } from "@/components/purchaseOrders/PurchaseOrdersList";
import { AddPurchaseOrderModal } from "@/components/purchaseOrders/AddPurchaseOrderModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function NewPurchaseOrderPage() {
  const { openModal, setOpenModal } = useApp();

  useEffect(() => {
    setOpenModal("add-purchase-order");
  }, [setOpenModal]);

  return (
    <>
      <PurchaseOrdersList />
      {openModal === "add-purchase-order" && <AddPurchaseOrderModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}