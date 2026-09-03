"use client";

import React, { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { fyShortName } from "@/lib/utils";
import { financialYearForDate } from "@/lib/financialYear";
import { BizLedgerLogo } from "@/components/shared/BizLedgerLogo";

export interface TopNavBarProps {
  onToggleSidebar?: () => void;
  onQuickAction?: () => void;
}

const ROUTE_LABELS: Record<string, { label: string; group?: string }> = {
  [ROUTES.dashboard]: { label: "Dashboard" },
  [ROUTES.customers]: { label: "Customers" },
  [ROUTES.products]: { label: "Products" },
  [ROUTES.invoices]: { label: "Invoices" },
  [ROUTES.expenses]: { label: "Expenses" },
  [ROUTES.vehicles]: { label: "Vehicles & Fleet" },
  [ROUTES.team]: { label: "Team Members" },
  [ROUTES.reports]: { label: "Reports & Analytics" },
  [ROUTES.settings]: { label: "Company Profile" },
  [ROUTES.billing]: { label: "Subscription & Billing" },
  [ROUTES.billingHistory]: { label: "Billing History", group: "Subscription & Billing" },
  [ROUTES.pricing]: { label: "Pricing Plans" },
};

export const TopNavBar: React.FC<TopNavBarProps> = ({
  onToggleSidebar,
  onQuickAction,
}) => {
  const {
    setIsNotificationOpen,
    notifications,
    getActiveFinancialYear,
    financialYears,
    activeFinancialYearId,
    setActiveFinancialYear,
  } = useApp();
  const { account, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [fyOpen, setFyOpen] = useState(false);
  const fyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (fyRef.current && !fyRef.current.contains(e.target as Node)) {
        setFyOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.replace("/");
  };

  const meta = ROUTE_LABELS[pathname] || { label: "BizLedger" };
  const breadcrumbs: { label: string; href?: string }[] = meta.group
    ? [{ label: "BizLedger" }, { label: meta.group }, { label: meta.label }]
    : [{ label: "BizLedger" }, { label: meta.label }];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const activeFy = getActiveFinancialYear();
  const activeFyLabel = activeFy ? activeFy.name.replace("Financial Year ", "FY ") : "FY";
  const currentFyId = (() => {
    try {
      return financialYearForDate(new Date()).id;
    } catch {
      return null;
    }
  })();
  const rolloverPending =
    !!activeFinancialYearId && currentFyId !== null && activeFinancialYearId !== currentFyId;

  return (
    <header
      id="top-nav-bar"
      className="h-16 bg-surface-container-lowest border-b border-outline-variant/30 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20"
    >
      {/* Left: Sidebar Toggle + Breadcrumb */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors"
          title="Toggle Navigation"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        {/* Mobile brand logo (desktop branding lives in the sidebar) */}
        <div className="sm:hidden flex items-center">
          <BizLedgerLogo size="compact" />
        </div>

        <nav id="topbar-breadcrumbs" className="hidden sm:flex items-center gap-2 text-xs font-medium truncate">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-outline-variant">/</span>}
              <span
                className={`${
                  idx === breadcrumbs.length - 1
                    ? 'text-on-surface font-semibold'
                    : 'text-secondary'
                }`}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-md hidden md:block">
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
            search
          </span>
          <input
            id="topbar-global-search"
            type="text"
            placeholder="Search customers, products, invoices..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-9 pr-12 py-1.5 bg-surface-container-low border border-transparent rounded-lg text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-outline-variant focus:bg-surface-container-lowest transition-all"
          />
          <kbd className="absolute right-3 text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-secondary font-mono border border-outline-variant/30">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Organization, Period, Notifications, Quick Action */}
      <div className="flex items-center gap-3">
        {/* Organization / Branch Switcher */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-low text-secondary text-xs font-medium border border-outline-variant/20">
          <BizLedgerLogo size="compact" className="-ml-1" />
          <span className="text-on-surface font-semibold max-w-[150px] truncate">BizLedger</span>
        </div>

        {/* Fiscal Year Selector */}
        <div ref={fyRef} className="relative hidden sm:block">
          <button
            id="btn-topbar-fy"
            onClick={() => setFyOpen((o) => !o)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary text-on-primary hover:bg-primary-container transition-colors"
            title={rolloverPending ? "Financial year has ended — new documents will roll over to the current year" : "Switch Financial Year"}
          >
            {activeFyLabel}
            {rolloverPending && (
              <span className="material-symbols-outlined text-[12px] text-amber-300" title="Rollover pending">autorenew</span>
            )}
            <span className="material-symbols-outlined text-[14px] text-on-primary">expand_more</span>
          </button>
          {fyOpen && (
            <div className="absolute right-0 top-9 z-50 w-64 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-2 shadow-lg">
              <div className="px-3 py-1.5 border-b border-outline-variant/30 mb-1">
                <p className="text-xs font-bold text-on-surface">Financial Year</p>
                <p className="text-[11px] text-outline">Drives dashboard &amp; reports</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {financialYears.map((fy) => {
                  const isActive = fy.id === activeFinancialYearId;
                  return (
                    <button
                      key={fy.id}
                      onClick={() => {
                        setActiveFinancialYear(fy.id);
                        setFyOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs text-left transition-colors ${
                        isActive
                          ? "bg-primary-container text-primary font-bold"
                          : "text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      <span className="truncate">
                        {fyShortName(fy.name)}
                      </span>
                      {isActive && (
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="pt-1.5 border-t border-outline-variant/30 mt-1">
                <button
                  onClick={() => {
                    setFyOpen(false);
                    router.push(ROUTES.financialYears);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-secondary hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                  Manage Financial Years
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications Icon */}
        <button
          id="btn-topbar-notifications"
          onClick={() => setIsNotificationOpen(true)}
          className="relative p-2 rounded-full text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-primary text-on-primary rounded-full text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Quick Action Button */}
        <button
          id="btn-topbar-quick-action"
          onClick={onQuickAction}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-md text-xs font-semibold hover:bg-primary-container active:scale-[0.98] transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>New Entry</span>
        </button>

        {/* User / Account menu */}
        <div ref={menuRef} className="relative">
          <button
            id="btn-topbar-user-menu"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary text-xs font-bold hover:bg-primary-container transition-colors"
            title="Account"
          >
            {account?.name ? account.name.charAt(0).toUpperCase() : "U"}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-2 shadow-lg">
              <div className="px-3 py-2 border-b border-outline-variant/30 mb-1">
                <p className="text-xs font-bold text-on-surface truncate">
                  {account?.name || "Account"}
                </p>
                <p className="text-[11px] text-outline truncate">{account?.email}</p>
                {account?.businessName && (
                  <p className="text-[11px] text-secondary truncate mt-0.5">
                    {account.businessName}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push(ROUTES.settings);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">settings</span>
                Settings
              </button>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  "BizLedger Feedback"
                )}`}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                Feedback
              </a>
              <button
                id="btn-topbar-logout"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-error hover:bg-error/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">logout</span>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};