"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { QuotationsList } from "@/components/quotations/QuotationsList";
import { SalesDocumentModal } from "@/components/shared/SalesDocumentModal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function QuotationsPage() {
  const { openModal } = useApp();

  return (
    <>
      <QuotationsList />
      {openModal === "add-quotation" && <SalesDocumentModal kind="quotation" />}
      {openModal === "add-customer" && <AddCustomerModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}