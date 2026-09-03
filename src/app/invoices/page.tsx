"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { InvoicesList } from "@/components/invoices/InvoicesList";
import { AddInvoiceModal } from "@/components/invoices/AddInvoiceModal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function InvoicesPage() {
  const { openModal } = useApp();

  return (
    <>
      <InvoicesList />
      {openModal === "add-invoice" && <AddInvoiceModal />}
      {openModal === "add-customer" && <AddCustomerModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}
