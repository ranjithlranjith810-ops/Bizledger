"use client";

import React, { useState } from "react";
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
import { useApp } from "@/context/AppContext";

interface QuickAction {
  label: string;
  icon: string;
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
  const [quickOpen, setQuickOpen] = useState(false);
  const router = useRouter();
  const { setOpenModal, openModal } = useApp();

  return (
    <div className="flex h-screen w-full bg-background text-on-surface overflow-hidden">
      {/* Side Navigation Bar (desktop) */}
      <SideNavBar collapsed={collapsed} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNavBar
          onToggleSidebar={() => setCollapsed(!collapsed)}
          onQuickAction={() => setQuickOpen((o) => !o)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Quick Action Dropdown */}
      {quickOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setQuickOpen(false)} />
          <div className="fixed top-16 right-4 z-50 w-56 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-2xl p-2 animate-[fadeIn_0.15s_ease-out]">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
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
                <span className="material-symbols-outlined text-[18px] text-primary">{action.icon}</span>
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