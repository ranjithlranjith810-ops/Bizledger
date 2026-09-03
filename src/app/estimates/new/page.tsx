"use client";

import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { EstimatesList } from "@/components/estimates/EstimatesList";
import { SalesDocumentModal } from "@/components/shared/SalesDocumentModal";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";
import { AddProductModal } from "@/components/products/AddProductModal";

export default function NewEstimatePage() {
  const { openModal, setOpenModal } = useApp();

  useEffect(() => {
    setOpenModal("add-estimate");
  }, [setOpenModal]);

  return (
    <>
      <EstimatesList />
      {openModal === "add-estimate" && <SalesDocumentModal kind="estimate" />}
      {openModal === "add-customer" && <AddCustomerModal />}
      {openModal === "add-product" && <AddProductModal />}
    </>
  );
}