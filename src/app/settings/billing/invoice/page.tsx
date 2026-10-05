"use client";

import { Suspense } from "react";
import { PaymentDetailsView } from "@/components/billing/PaymentDetailsView";
import { Icon } from "../../../../components/ui/Icon";

export default function BillingInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-xs text-gray-400 gap-2">
          <Icon name="progress_activity" className="animate-spin text-base" />
          Loading…
        </div>
      }
    >
      <PaymentDetailsView />
    </Suspense>
  );
}