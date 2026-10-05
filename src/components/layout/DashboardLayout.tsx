"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SideNavBar } from "@/components/layout/SideNavBar";
import { TopNavBar } from "@/components/layout/TopNavBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationDrawer } from "@/components/layout/NotificationDrawer";
import { DeleteConfirmModal } from "@/components/shared/DeleteConfirmModal";
import { ToastContainer } from "@/components/shared/ToastContainer";
import { AddExpenseModal } from "@/components/expenses/AddExpenseModal";
import { ExpenseDetailsModal } from "@/components/expenses/ExpenseDetailsModal";
import { AddVehicleModal } from "@/components/vehicles/AddVehicleModal";
import { AddVehicleExpenseModal } from "@/components/vehicles/AddVehicleExpenseModal";
import { AddTeamMemberModal } from "@/components/team/AddTeamMemberModal";
import { AppLegalFooter } from "@/components/legal/AppLegalFooter";
import { useApp } from "@/context/AppContext";
import { Icon, type IconName } from "../ui/Icon";

interface QuickAction {
  label: string;
  icon: IconName;
  href?: string;
  modal?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Customer", href: "/customers", modal: "add-customer", icon: "person_add" },
  { label: "New Product", href: "/products", modal: "add-product", icon: "inventory_2" },
  { label: "New Invoice", href: "/invoices", modal: "add-invoice", icon: "description" },
  { label: "New Quotation", href: "/quotations", modal: "add-quotation", icon: "request_quote" },
  { label: "New Estimate", href: "/estimates", modal: "add-estimate", icon: "insights" },
  { label: "New Purchase Order", href: "/purchase-orders", modal: "add-purchase-order", icon: "shopping_cart" },
  { label: "New Expense", modal: "add-expense", icon: "receipt_long" },
  { label: "New Vehicle", modal: "add-vehicle", icon: "local_shipping" },
  { label: "Invite Team Member", modal: "add-team-member", icon: "group_add" },
];

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { setOpenModal, openModal } = useApp();

  // Escape closes the quick-action menu and returns focus to its trigger.
  useEffect(() => {
    if (!quickOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setQuickOpen(false);
      document.getElementById("btn-topbar-quick-action")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [quickOpen]);

  // Move keyboard focus into the menu once it opens so the keyboard user does
  // not stay on the trigger while focus-dependent styling changes underneath.
  useEffect(() => {
    if (!quickOpen) return;
    quickMenuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [quickOpen]);

  // Shared sidebar state: the same hamburger toggles desktop collapse on wide
  // screens and the mobile drawer on narrow screens. There is ONE set of nav
  // state so no page duplicates sidebar control.
  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background text-on-surface overflow-hidden">
      {/* Side Navigation Bar (desktop) + Mobile Drawer (same shared component) */}
      <SideNavBar collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNavBar
          onToggleSidebar={handleToggleSidebar}
          onQuickAction={() => setQuickOpen((o) => !o)}
          quickActionOpen={quickOpen}
        />

        {/* Bottom padding is set per-side instead of via the `p-*` shorthand.
            `p-4 sm:p-6 md:p-8 pb-24 lg:pb-8` let the later `sm:`/`md:`
            shorthands clobber `pb-24`, so the fixed mobile nav covered the last
            rows of content. The clearance is now the nav's height
            (h-16 = 4rem) plus the home-indicator safe area plus breathing room,
            and it is only released at lg where the nav is hidden. */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 md:px-8 md:pt-8 lg:pb-8">
          <div className="max-w-7xl mx-auto">
            {children}
            <AppLegalFooter />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Quick Action Dropdown */}
      {quickOpen && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setQuickOpen(false)} />
          <div
            ref={quickMenuRef}
            role="menu"
            aria-label="Quick actions"
            className="fixed top-16 right-4 z-50 w-56 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-2xl p-2 animate-[fadeIn_0.15s_ease-out]"
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                role="menuitem"
                onClick={() => {
                  setQuickOpen(false);
                  if (action.modal) {
                    setOpenModal(action.modal);
                  }
                  if (action.href) {
                    router.push(action.href);
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-on-surface hover:bg-surface-container-low transition-colors"
              >
                <Icon name={action.icon} className="text-[18px] text-primary" />
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Global Overlays */}
      <NotificationDrawer />
      <DeleteConfirmModal />
      <ToastContainer />
      {openModal === "add-expense" && <AddExpenseModal />}
      {openModal === "expense-details" && <ExpenseDetailsModal />}
      {openModal === "add-vehicle" && <AddVehicleModal />}
      {openModal === "add-vehicle-expense" && <AddVehicleExpenseModal />}
      {openModal === "add-team-member" && <AddTeamMemberModal />}
    </div>
  );
};