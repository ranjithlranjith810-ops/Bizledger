"use client";

import { Suspense } from "react";
import { PaymentDetailsView } from "@/components/billing/PaymentDetailsView";

export default function BillingInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-xs text-gray-400 gap-2">
          <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          Loading…
        </div>
      }
    >
      <PaymentDetailsView />
    </Suspense>
  );
}