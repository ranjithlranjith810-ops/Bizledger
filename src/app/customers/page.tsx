"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { CustomersListView } from "@/components/customers/CustomersListView";
import { AddCustomerModal } from "@/components/customers/AddCustomerModal";

export default function CustomersPage() {
  const { openModal } = useApp();

  return (
    <>
      <CustomersListView />
      {openModal === "add-customer" && <AddCustomerModal />}
    </>
  );
}
