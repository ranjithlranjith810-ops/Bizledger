"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Store, Lock, ArrowRight } from "lucide-react";

// Central "paid upgrade" gate for the Business Network / public directory.
// Renders an upgrade prompt instead of page content whenever the active plan
// does not include the directory (Base plan or no active plan). All directory
// entry points wrap their content in this so the gate is enforced regardless of
// how the user arrives (nav, direct URL, share link).
export const BusinessNetworkGate: React.FC<{
  entitled: boolean;
  children: React.ReactNode;
}> = ({ entitled, children }) => {
  const router = useRouter();

  if (entitled) return <>{children}</>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#eceef0] shadow-xs overflow-hidden">
        <div className="bg-gradient-to-br from-[#93000b] to-[#6d0006] px-6 py-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 text-white mb-4">
            <Store className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Business Network is a paid feature
          </h2>
          <p className="text-white/80 text-xs max-w-xl mx-auto mt-2 leading-relaxed">
            The public business directory — discovering and connecting with
            vetted businesses across India — is included with the Business and
            Enterprise plans.
          </p>
        </div>
        <div className="px-6 py-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => router.push("/pricing")}
            className="inline-flex items-center gap-2 bg-[#93000b] hover:bg-[#770008] text-white px-6 py-3 rounded-xl text-sm font-bold shadow-xs transition-colors"
          >
            <Lock className="w-4 h-4" />
            <span>View Plans &amp; Upgrade</span>
          </button>
          <button
            onClick={() => router.push("/settings/billing")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-gray-600 border border-[#eceef0] hover:bg-[#f7f9fb] transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>Go to Subscription</span>
          </button>
        </div>
        <div className="px-6 pb-6 text-center text-[11px] text-gray-400">
          Already subscribed? Make sure your subscription is active on the Billing page.
        </div>
      </div>
    </div>
  );
};