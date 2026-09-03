import React from "react";

export interface DashboardBadgeProps {
  status: string;
  className?: string;
}

export const DashboardBadge: React.FC<DashboardBadgeProps> = ({ status, className = '' }) => {
  const normalized = status.toLowerCase();

  let bgClass = "bg-slate-100 text-slate-700";
  let dotClass = "bg-slate-400";

  if (normalized === 'accepted' || normalized === 'paid' || normalized === 'allocated' || normalized === 'completed') {
    bgClass = "bg-[#dcfce7] text-[#166534]";
    dotClass = "bg-[#10b981]";
  } else if (normalized === 'sent' || normalized === 'partial' || normalized === 'in review' || normalized === 'active') {
    bgClass = "bg-[#dbeafe] text-[#1d4ed8]";
    dotClass = "bg-[#3b82f6]";
  } else if (normalized === 'requested' || normalized === 'pending' || normalized === 'processing') {
    bgClass = "bg-[#fef3c7] text-[#b45309]";
    dotClass = "bg-[#f59e0b]";
  } else if (normalized === 'expired' || normalized === 'overdue' || normalized === 'rejected' || normalized === 'unpaid') {
    bgClass = "bg-[#fee2e2] text-[#991b1b]";
    dotClass = "bg-[#ef4444]";
  } else if (normalized === 'draft' || normalized === 'unallocated') {
    bgClass = "bg-[#f1f5f9] text-[#475569]";
    dotClass = "bg-[#94a3b8]";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${bgClass} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {status}
    </span>
  );
};