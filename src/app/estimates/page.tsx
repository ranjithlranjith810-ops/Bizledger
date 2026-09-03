"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { EstimatesList } from "@/components/estimates/EstimatesList";
import { SalesDocumentModal } from "@/components/shared/SalesDocumentModal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function EstimatesPage() {
  const { openModal } = useApp();

  return (
    <>
      <EstimatesList />
      {openModal === "add-estimate" && <SalesDocumentModal kind="estimate" />}
      {openModal === "add-customer" && <AddCustomerModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}