import React from "react";

export interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: string;
  isPositive?: boolean;
  icon?: React.ReactNode;
  variant?: 'default' | 'maroon' | 'outline';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  trend,
  isPositive,
  icon,
  variant = 'default',
}) => {
  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${
      variant === 'maroon'
        ? 'bg-[#fef2f2] border-[#ffdad6] text-[#93000b]'
        : 'bg-white border-slate-200 text-[#191c1e] shadow-sm'
    }`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#515f74] uppercase tracking-wider">{label}</p>
        {icon && <div className="text-[#93000b] opacity-80">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <h3 className="text-2xl font-bold tracking-tight text-[#191c1e]">{value}</h3>
        {subValue && <span className="text-xs text-[#515f74] font-medium">{subValue}</span>}
      </div>
      {trend && (
        <p className={`mt-1 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trend}
        </p>
      )}
    </div>
  );
};