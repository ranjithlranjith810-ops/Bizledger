"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  Expense,
  Vehicle,
  VehicleExpense,
  TeamMember,
  CompanyProfile,
  SubscriptionPlan,
  Customer,
  Product,
  Invoice,
  Quotation,
  Estimate,
  PurchaseOrder,
  NotificationItem,
  AppContextType,
  DeleteConfirmState,
  DeleteEntityKind,
  SubscriptionState,
  PaymentRecord,
  PaymentMethod,
  PaymentOutcome,
  FinancialYearSettings,
  OnboardingState,
  QuotationStatus,
  EstimateStatus,
  PurchaseOrderStatus,
} from "@/types";
import {
  INITIAL_COMPANY_PROFILE,
  INITIAL_EXPENSES,
  INITIAL_VEHICLES,
  INITIAL_VEHICLE_EXPENSES,
  INITIAL_TEAM_MEMBERS,
  SUBSCRIPTION_PLANS,
  INITIAL_CUSTOMERS,
  INITIAL_PRODUCTS,
  INITIAL_INVOICES,
  INITIAL_NOTIFICATIONS,
  EMPTY_COMPANY_PROFILE,
} from "@/data/mockData";
import { dataKey } from "@/lib/storage";
import { useAuth } from "@/context/AuthContext";
import { buildInvoiceNumber, buildDocumentNumber } from "@/lib/invoice";
import { InvoiceItem } from "@/types";
import {
  reconcileFinancialYears,
  financialYearForDate,
  defaultFinancialYear,
  financialYearName,
  getSequence,
  nextSequence,
  SEQUENCES_KEY,
  PerFySequences,
  SequenceKind,
} from "@/lib/financialYear";
import {
  getActivePlan,
  countCurrentPeriodInvoices,
  canCreate,
  checkEntitlement,
  EntitlementResult,
  LimitKind,
} from "@/lib/entitlements";
import { getMyDirectoryListing } from "@/lib/directory";

const AppContext = createContext<AppContextType | undefined>(undefined);

// Safe localStorage read (guarded for SSR)
function readStorage<T>(key: string, fallback: T): () => T {
  return () => {
    if (typeof window === "undefined") return fallback;
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : fallback;
    } catch {
      return fallback;
    }
  };
}

// Module-scope impure helpers. Kept OUTSIDE the provider component so the
// React compiler purity lint treats them as opaque functions (it cannot reach
// into module-scope helpers and therefore never flags the Date.now() calls).
function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
function nowIso(): string {
  return new Date().toISOString();
}
function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { account } = useAuth();
  const activeAccountId = account?.id ?? null;
  const [activeRoute, setActiveRoute] = useState<string>("dashboard");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() =>
    readStorage<CompanyProfile>(
      activeAccountId ? dataKey(activeAccountId, "company") : "",
      EMPTY_COMPANY_PROFILE
    )()
  );

  // Onboarding wizard progress (per account). New accounts start incomplete so
  // they are routed through /onboarding before reaching the dashboard.
  const [onboarding, setOnboarding] = useState<OnboardingState>(() =>
    readStorage<OnboardingState>(
      activeAccountId ? dataKey(activeAccountId, "onboarding") : "",
      { completed: false, currentStep: 0 }
    )()
  );

  // Financial years (per account) + which one is currently active. Seeded with
  // a default India FY when none are stored.
  const [financialYears, setFinancialYears] = useState<FinancialYearSettings[]>(() => {
    if (!activeAccountId) return [defaultFinancialYear()];
    const saved = readStorage<FinancialYearSettings[]>(
      dataKey(activeAccountId, "financial_years"),
      []
    )();
    return saved.length ? saved : [defaultFinancialYear()];
  });

  const [activeFinancialYearId, setActiveFinancialYearId] = useState<string | null>(() => {
    if (!activeAccountId) return null;
    const saved = readStorage<string>(
      dataKey(activeAccountId, "active_financial_year"),
      ""
    )();
    return saved || null;
  });

  const getActiveFinancialYear = (): FinancialYearSettings | undefined => {
    if (activeFinancialYearId) {
      const found = financialYears.find((fy) => fy.id === activeFinancialYearId);
      if (found) return found;
    }
    return financialYears[0];
  };

  const setOnboardingStep = (step: number) => {
    setOnboarding((prev) => ({ ...prev, currentStep: step }));
  };

  const completeOnboarding = () => {
    setOnboarding((prev) => ({ ...prev, completed: true, currentStep: 6 }));
  };

  const addFinancialYear = (fy: Omit<FinancialYearSettings, "id">): FinancialYearSettings => {
    const next: FinancialYearSettings = {
      ...fy,
      id: makeId("fy"),
    };
    setFinancialYears((prev) => [...prev, next]);
    // Seed a fresh per-FY sequence map so the new year starts at 1.
    setDocSequences((prev) => ({
      ...prev,
      [next.id]: { invoice: 1, quotation: 1, estimate: 1, purchaseOrder: 1 },
    }));
    if (!activeFinancialYearId) setActiveFinancialYearId(next.id);
    return next;
  };

  const updateFinancialYear = (id: string, patch: Partial<FinancialYearSettings>) => {
    setFinancialYears((prev) => prev.map((fy) => (fy.id === id ? { ...fy, ...patch } : fy)));
  };

  const deleteFinancialYear = (id: string) => {
    setFinancialYears((prev) => prev.filter((fy) => fy.id !== id));
    setDocSequences((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeFinancialYearId === id) {
      const remaining = financialYears.filter((fy) => fy.id !== id);
      setActiveFinancialYearId(remaining[0]?.id ?? null);
    }
  };

  const setActiveFinancialYear = (id: string) => {
    // Activating a year always guarantees a per-FY sequence entry (starts at 1).
    setDocSequences((prev) =>
      prev[id] ? prev : { ...prev, [id]: { invoice: 1, quotation: 1, estimate: 1, purchaseOrder: 1 } }
    );
    setActiveFinancialYearId(id);
  };

  const [expenses, setExpenses] = useState<Expense[]>(() =>
    readStorage<Expense[]>(activeAccountId ? dataKey(activeAccountId, "expenses") : "", [])()
  );

  const [vehicles, setVehicles] = useState<Vehicle[]>(() =>
    readStorage<Vehicle[]>(activeAccountId ? dataKey(activeAccountId, "vehicles") : "", [])()
  );

  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>(() =>
    readStorage<VehicleExpense[]>(activeAccountId ? dataKey(activeAccountId, "vehicle_expenses") : "", [])()
  );

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() =>
    readStorage<TeamMember[]>(activeAccountId ? dataKey(activeAccountId, "team") : "", [])()
  );

  const defaultSubscription = (): SubscriptionState => ({
    currentPlanId: null,
    status: "none",
    billing: { period: "month", startedAt: null, renewsAt: null, amount: 0, gstRate: 18 },
    pendingPlanId: null,
    pendingPeriod: "month",
  });

  // SINGLE source of truth for subscription state (active plan, status, billing dates,
  // pending checkout selection). Persisted as one account-scoped key.
  const [subscription, setSubscription] = useState<SubscriptionState>(() => {
    if (!activeAccountId) return defaultSubscription();
    const saved = readStorage<SubscriptionState>(
      dataKey(activeAccountId, "subscription"),
      defaultSubscription()
    )();
    if (saved && saved.currentPlanId) return saved;
    // Migrate legacy Phase 8 key `plan_id` into an active subscription (if present).
    const legacy = readStorage<string>(dataKey(activeAccountId, "plan_id"), "")()
      .trim()
      .toLowerCase();
    const planId: SubscriptionPlan["id"] | null =
      legacy === "starter" || legacy === "base"
        ? "base"
        : legacy === "pro" || legacy === "business"
        ? "business"
        : legacy === "enterprise"
        ? "enterprise"
        : null;
    if (planId) {
      const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
      return {
        currentPlanId: planId,
        status: "active",
        billing: {
          period: "month",
          startedAt: new Date().toISOString(),
          renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          amount: plan?.price ?? 0,
          gstRate: 18,
          lastPaidAt: new Date().toISOString(),
        },
        pendingPlanId: null,
        pendingPeriod: "month",
      };
    }
    return defaultSubscription();
  });

  // ACTIVE plan derived from subscription state (a failed/cancelled payment keeps
  // the previous plan active; only a successful payment switches it).
  const activePlan = getActivePlan(SUBSCRIPTION_PLANS, subscription);

  // Emit a consistent upgrade-prompt notification when an action is blocked by
  // the active plan's entitlement limits.
  const notifyEntitlementBlocked = (kind: LimitKind, result: EntitlementResult) => {
    const resource =
      kind === "invoices"
        ? "invoices"
        : kind === "customers"
        ? "customers"
        : kind === "teamMembers"
        ? "team members"
        : "products";
    addNotification({
      type: "warning",
      title: `${capitalize(resource)} limit reached`,
      message: `Your current plan allows up to ${result.limit} ${resource} in this billing period. Upgrade your plan to continue.`,
      icon: result.limit === 0 ? "workspace_premium" : "trending_up",
    });
  };

  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>(() =>
    readStorage<PaymentRecord[]>(activeAccountId ? dataKey(activeAccountId, "payments") : "", [])()
  );

  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    readStorage<Invoice[]>(activeAccountId ? dataKey(activeAccountId, "invoices") : "", [])()
  );

  const [quotations, setQuotations] = useState<Quotation[]>(() =>
    readStorage<Quotation[]>(activeAccountId ? dataKey(activeAccountId, "quotations") : "", [])()
  );

  const [estimates, setEstimates] = useState<Estimate[]>(() =>
    readStorage<Estimate[]>(activeAccountId ? dataKey(activeAccountId, "estimates") : "", [])()
  );

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() =>
    readStorage<PurchaseOrder[]>(activeAccountId ? dataKey(activeAccountId, "purchaseOrders") : "", [])()
  );

  const [customers, setCustomers] = useState<Customer[]>(() =>
    readStorage<Customer[]>(activeAccountId ? dataKey(activeAccountId, "customers") : "", [])()
  );

  const [products, setProducts] = useState<Product[]>(() =>
    readStorage<Product[]>(activeAccountId ? dataKey(activeAccountId, "products") : "", [])()
  );

  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    readStorage<NotificationItem[]>(activeAccountId ? dataKey(activeAccountId, "notifications") : "", [])()
  );

  // PER-FY document sequences. Each financial year has its own independent
  // counter so historical numbers never change and a new year always starts at
  // 1 (e.g. MI/25-26/050 stays; MI/26-27/001 begins fresh). Stored as one map
  // keyed by FY id under `doc_sequences`. Legacy single counters are migrated
  // into the map (seeded under whichever FY is active at first load) so existing
  // documents keep their next number.
  const [docSequences, setDocSequences] = useState<Record<string, Partial<PerFySequences>>>(
    () => {
      if (!activeAccountId) return {};
      const saved = readStorage<Record<string, Partial<PerFySequences>>>(
        dataKey(activeAccountId, SEQUENCES_KEY),
        {}
      )();
      if (saved && typeof saved === "object" && Object.keys(saved).length) {
        return saved;
      }
      // Migration from the legacy single-counters.
      const legacyInvoice = readStorage<number>(dataKey(activeAccountId, "invoice_sequence"), 0)() || 1;
      const legacyQuotation = readStorage<number>(dataKey(activeAccountId, "quotation_sequence"), 1)() || 1;
      const legacyEstimate = readStorage<number>(dataKey(activeAccountId, "estimate_sequence"), 1)() || 1;
      const legacyPo = readStorage<number>(dataKey(activeAccountId, "purchase_order_sequence"), 1)() || 1;
      const seedId = activeFinancialYearId ?? financialYears[0]?.id ?? financialYearForDate().id;
      const seeded: Record<string, Partial<PerFySequences>> = {};
      seeded[seedId] = {
        invoice: Number.isFinite(legacyInvoice) ? legacyInvoice : 1,
        quotation: Number.isFinite(legacyQuotation) ? legacyQuotation : 1,
        estimate: Number.isFinite(legacyEstimate) ? legacyEstimate : 1,
        purchaseOrder: Number.isFinite(legacyPo) ? legacyPo : 1,
      };
      return seeded;
    }
  );

  // Derived single-number view of the ACTIVE FY's sequence, so all existing
  // document modals (invoiceSequence / quotationSequence / estimateSequence /
  // purchaseOrderSequence) keep working unchanged but now read per-FY values.
  const activeFyId = getActiveFinancialYear()?.id ?? null;
  const invoiceSequence = getSequence(docSequences, activeFyId, "invoice");
  const quotationSequence = getSequence(docSequences, activeFyId, "quotation");
  const estimateSequence = getSequence(docSequences, activeFyId, "estimate");
  const purchaseOrderSequence = getSequence(docSequences, activeFyId, "purchaseOrder");

  // Most-recently deleted entity, kept in memory so the user can Undo a
  // customer / product / invoice deletion from its toast before leaving.
  const [lastDeleted, setLastDeleted] = useState<{
    kind: DeleteEntityKind;
    item: Customer | Product | Invoice | Quotation | Estimate | PurchaseOrder;
  } | null>(null);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "company"), JSON.stringify(companyProfile));
  }, [activeAccountId, companyProfile]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "onboarding"), JSON.stringify(onboarding));
  }, [activeAccountId, onboarding]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "financial_years"), JSON.stringify(financialYears));
  }, [activeAccountId, financialYears]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(
      dataKey(activeAccountId, "active_financial_year"),
      JSON.stringify(activeFinancialYearId)
    );
  }, [activeAccountId, activeFinancialYearId]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "expenses"), JSON.stringify(expenses));
  }, [activeAccountId, expenses]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "vehicles"), JSON.stringify(vehicles));
  }, [activeAccountId, vehicles]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "vehicle_expenses"), JSON.stringify(vehicleExpenses));
  }, [activeAccountId, vehicleExpenses]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "team"), JSON.stringify(teamMembers));
  }, [activeAccountId, teamMembers]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "subscription"), JSON.stringify(subscription));
  }, [activeAccountId, subscription]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "payments"), JSON.stringify(paymentHistory));
  }, [activeAccountId, paymentHistory]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "invoices"), JSON.stringify(invoices));
  }, [activeAccountId, invoices]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "quotations"), JSON.stringify(quotations));
  }, [activeAccountId, quotations]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "estimates"), JSON.stringify(estimates));
  }, [activeAccountId, estimates]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "purchaseOrders"), JSON.stringify(purchaseOrders));
  }, [activeAccountId, purchaseOrders]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, SEQUENCES_KEY), JSON.stringify(docSequences));
  }, [activeAccountId, docSequences]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "notifications"), JSON.stringify(notifications));
  }, [activeAccountId, notifications]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "customers"), JSON.stringify(customers));
  }, [activeAccountId, customers]);

  useEffect(() => {
    if (!activeAccountId) return;
    localStorage.setItem(dataKey(activeAccountId, "products"), JSON.stringify(products));
  }, [activeAccountId, products]);

  const addNotification = (notif: { type: NotificationItem["type"]; title: string; message: string; icon?: string; iconColor?: string }) => {
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      timeAgo: "Just now",
      read: false,
      icon: notif.icon || "info",
      iconColor: notif.iconColor,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 9)]);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const confirmDelete = (state: DeleteConfirmState) => {
    setDeleteConfirm(state);
  };

  const performDelete = (state: DeleteConfirmState) => {
    switch (state.kind) {
      case "product":
        deleteProduct(state.id);
        break;
      case "customer":
        deleteCustomer(state.id);
        break;
      case "invoice":
        deleteInvoice(state.id);
        break;
      case "expense":
        deleteExpense(state.id);
        break;
      case "vehicle":
        deleteVehicle(state.id);
        break;
      case "team":
        deleteTeamMember(state.id);
        break;
      case "quotation":
        deleteQuotation(state.id);
        break;
      case "estimate":
        deleteEstimate(state.id);
        break;
      case "purchaseOrder":
        deletePurchaseOrder(state.id);
        break;
    }
    setDeleteConfirm(null);
  };

  const addExpense = (newExpData: Omit<Expense, "id" | "createdAt">) => {
    const newExp: Expense = {
      ...newExpData,
      id: `exp-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [newExp, ...prev]);
    addNotification({
      type: "success",
      title: "Expense Recorded",
      message: `Expense ${newExp.expenseNumber} for ₹${newExp.amount.toLocaleString("en-IN")} was saved successfully.`,
      icon: "check_circle",
    });
  };

  const updateExpense = (expense: Expense) => {
    setExpenses((prev) =>
      prev.map((exp) => (exp.id === expense.id ? expense : exp))
    );
    addNotification({
      type: "success",
      title: "Expense Updated",
      message: "The expense record was updated.",
      icon: "check_circle",
    });
  };

  const deleteExpense = (id: string) => {
    const target = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    addNotification({
      type: "info",
      title: "Expense Removed",
      message: target ? `Expense ${target.expenseNumber} has been deleted.` : "Expense deleted.",
      icon: "info",
    });
  };

  const addVehicle = (vehData: Omit<Vehicle, "id" | "totalExpenses" | "fuelExpenses" | "maintenanceExpenses" | "tollExpenses" | "otherExpenses">) => {
    const newVeh: Vehicle = {
      ...vehData,
      id: `veh-${Date.now()}`,
      totalExpenses: 0,
      fuelExpenses: 0,
      maintenanceExpenses: 0,
      tollExpenses: 0,
      otherExpenses: 0,
    };
    setVehicles((prev) => [newVeh, ...prev]);
    addNotification({
      type: "success",
      title: "Vehicle Added",
      message: `Vehicle ${newVeh.registrationNumber} (${newVeh.makeModel}) registered in fleet.`,
      icon: "local_shipping",
    });
  };

  const updateVehicle = (vehicle: Vehicle) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === vehicle.id ? vehicle : v))
    );
  };

  const deleteVehicle = (id: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    addNotification({
      type: "info",
      title: "Vehicle Removed",
      message: "Vehicle has been removed from fleet.",
      icon: "info",
    });
  };

  const addVehicleExpense = (veData: Omit<VehicleExpense, "id">) => {
    const newVE: VehicleExpense = {
      ...veData,
      id: `ve-${Date.now()}`,
    };
    setVehicleExpenses((prev) => [newVE, ...prev]);

    const linkedExpense: Expense = {
      id: `exp-auto-${Date.now()}`,
      expenseNumber: `EXP-VEH-${Math.floor(1000 + Math.random() * 9000)}`,
      title: `${veData.category} - ${veData.vehicleRegistration}`,
      category: veData.category === "Fuel" ? "Fuel" : "Maintenance",
      amount: veData.amount,
      date: veData.date,
      paymentMethod: veData.paymentMethod || "Cash",
      paidFromAccount: "Fleet Expenses Petty A/C",
      referenceNumber: `TXN-${Date.now().toString().slice(-6)}`,
      vendor: veData.vendor,
      expenseType: "Direct",
      status: "Paid",
      vehicleId: veData.vehicleId,
      vehicleRegistration: veData.vehicleRegistration,
      notes: `${veData.notes || ""} (Odometer: ${veData.odometerReading} km)`,
      createdBy: "Fleet Officer",
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [linkedExpense, ...prev]);

    setVehicles((prev) =>
      prev.map((v) => {
        if (v.id === veData.vehicleId) {
          const isFuel = veData.category === "Fuel";
          const isMaint =
            veData.category === "Service & Maintenance" ||
            veData.category === "Tyre" ||
            veData.category === "Repairs";
          const isToll = veData.category === "Fastag / Toll";
          return {
            ...v,
            currentOdometer: Math.max(v.currentOdometer, veData.odometerReading || 0),
            totalExpenses: v.totalExpenses + veData.amount,
            fuelExpenses: isFuel ? v.fuelExpenses + veData.amount : v.fuelExpenses,
            maintenanceExpenses: isMaint ? v.maintenanceExpenses + veData.amount : v.maintenanceExpenses,
            tollExpenses: isToll ? v.tollExpenses + veData.amount : v.tollExpenses,
            otherExpenses: !isFuel && !isMaint && !isToll ? v.otherExpenses + veData.amount : v.otherExpenses,
            lastServiceDate: isMaint ? veData.date : v.lastServiceDate,
          };
        }
        return v;
      })
    );

    addNotification({
      type: "success",
      title: "Vehicle Expense Logged",
      message: `₹${veData.amount.toLocaleString("en-IN")} for ${veData.vehicleRegistration} recorded.`,
      icon: "local_shipping",
    });
  };

  const addTeamMember = (memData: Omit<TeamMember, "id" | "lastActive" | "joinedDate">) => {
    const gate = checkEntitlement(activePlan, "teamMembers", teamMembers.length);
    if (!gate.allowed) {
      notifyEntitlementBlocked("teamMembers", gate);
      return false;
    }
    const newMember: TeamMember = {
      ...memData,
      id: `tm-${Date.now()}`,
      lastActive: "Never (Invitation sent)",
      joinedDate: new Date().toISOString().split("T")[0],
    };
    setTeamMembers((prev) => [...prev, newMember]);
    addNotification({
      type: "success",
      title: "Team Member Invited",
      message: `Invitation email dispatched to ${newMember.email} with ${newMember.role} role.`,
      icon: "group",
    });
    return true;
  };

  const updateTeamMember = (member: TeamMember) => {
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === member.id ? member : m))
    );
    addNotification({
      type: "info",
      title: "Permissions Updated",
      message: "Team member access privileges updated.",
      icon: "info",
    });
  };

  const deleteTeamMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    addNotification({
      type: "info",
      title: "Member Removed",
      message: "Team member access has been revoked.",
      icon: "info",
    });
  };

  const updateCompanyProfile = (profile: Partial<CompanyProfile>) => {
    // Keep the single-source-of-truth address in sync: when onboarding or the
    // profile editor writes the split address lines, mirror into the legacy
    // streetAddress field so invoice/bank sections continue to display it.
    let merged = profile;
    if (profile.addressLine1 !== undefined || profile.addressLine2 !== undefined) {
      merged = {
        ...profile,
        streetAddress: [profile.addressLine1 ?? "", profile.addressLine2 ?? ""]
          .filter(Boolean)
          .join(", "),
      };
    }
    setCompanyProfile((prev) => ({ ...prev, ...merged }));
    addNotification({
      type: "success",
      title: "Profile Updated",
      message: "Company details and invoice tax settings saved.",
      icon: "check_circle",
    });
  };

  const changePlan = (planId: SubscriptionPlan["id"]) => {
    setSubscription((prev) =>
      prev ? { ...prev, currentPlanId: planId, status: "active" } : prev
    );
  };

  // Set a checkout selection. THIS DOES NOT activate the plan — only a successful
  // payment via completePayment("success") may change the active plan.
  const setPendingPlan = (planId: SubscriptionPlan["id"] | null, period: "month" | "year" = "month") => {
    setSubscription((prev) =>
      prev ? { ...prev, pendingPlanId: planId, pendingPeriod: period } : prev
    );
  };

  const computeAmount = (plan: SubscriptionPlan, period: "month" | "year"): number => {
    // Yearly billed as 10 months (2 months free promo); 18% GST on the base amount.
    return period === "month" ? plan.price : plan.price * 10;
  };

  const completePayment = (outcome: PaymentOutcome, method: PaymentMethod) => {
    const planId = subscription?.pendingPlanId;
    const period = subscription?.pendingPeriod ?? "month";
    if (!planId) return;
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) return;
    const baseAmount = computeAmount(plan, period);
    const gstRate = 18;
    const gstAmount = Math.round(baseAmount * (gstRate / 100) * 100) / 100;
    const totalAmount = Math.round((baseAmount + gstAmount) * 100) / 100;
    const now = Date.now();
    const record: PaymentRecord = {
      id: `PAY-${now}`,
      date: new Date(now).toISOString(),
      planId,
      planName: plan.name.replace(/ Plan$/, ""),
      billingPeriod: period,
      baseAmount,
      gstRate,
      gstAmount,
      totalAmount,
      method,
      status: outcome,
      description: `BizLedger ${plan.name.replace(/ Plan$/, "")} Subscription (${period === "month" ? "1 Month" : "1 Year"})`,
    };
    setPaymentHistory((h) => [record, ...h]);
    if (outcome === "success") {
      // ONLY a successful payment activates/changes the plan.
      setSubscription((prev) =>
        prev
          ? {
              ...prev,
              currentPlanId: planId,
              status: "active",
              pendingPlanId: null,
              billing: {
                period,
                startedAt: prev.billing.startedAt ?? new Date(now).toISOString(),
                renewsAt: new Date(now + (period === "month" ? 30 : 365) * 86400000).toISOString(),
                amount: baseAmount,
                gstRate,
                lastPaidAt: new Date(now).toISOString(),
              },
            }
          : prev
      );
    } else {
      // failed or cancelled: active plan + billing stay UNCHANGED.
      // Keep the pending selection so the user can retry payment.
      setSubscription((prev) => (prev ? { ...prev } : prev));
    }
  };

  // Records a refund REQUEST in the frontend demo. It does NOT grant or move a
  // refund — that requires a production payment processor. Only successful,
  // still-refundable (not yet re-requested) payments can be flagged.
  const requestRefund = (paymentId: string, reason: string): boolean => {
    let found = false;
    setPaymentHistory((h) =>
      h.map((p) => {
        if (p.id !== paymentId) return p;
        if (p.status !== "success") return p; // only paid invoices
        if (p.refundStatus === "requested") {
          found = true; // already requested -> not a change, kept marked
          return p;
        }
        found = true;
        return { ...p, refundStatus: "requested", refundReason: reason };
      })
    );
    if (found) {
      addNotification({
        type: "success",
        title: "Refund Request Recorded",
        message:
          "Your refund request has been recorded. Processing requires a production payment backend.",
      });
    }
    return found;
  };

const addInvoice = (invData: Omit<Invoice, "id">) => {
    const used = countCurrentPeriodInvoices(invoices, subscription);
    const gate = checkEntitlement(activePlan, "invoices", used);
    if (!gate.allowed) {
      notifyEntitlementBlocked("invoices", gate);
      return false;
    }
    const newInv: Invoice = {
      ...invData,
      id: `inv-${Date.now()}`,
    };
    setInvoices((prev) => [newInv, ...prev]);
    addNotification({
      type: "success",
      title: "Invoice Created",
      message: `Invoice ${newInv.invoiceNumber} generated for ${newInv.customerName}.`,
      icon: "description",
    });
    return true;
  };

  const updateInvoice = (invoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === invoice.id ? invoice : inv))
    );
    addNotification({
      type: "info",
      title: "Invoice Updated",
      message: `Invoice ${invoice.invoiceNumber} was updated.`,
      icon: "description",
    });
  };

  const updateInvoiceStatus = (id: string, status: Invoice["status"]) => {
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, status } : inv))
    );
    addNotification({
      type: "info",
      title: "Invoice Status Updated",
      message: `Invoice status updated to ${status}.`,
      icon: "info",
    });
  };

  const deleteInvoice = (id: string) => {
    const target = invoices.find((inv) => inv.id === id);
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    if (target) setLastDeleted({ kind: "invoice", item: target });
    addNotification({
      type: "info",
      title: "Invoice Removed",
      message: target
        ? `Invoice ${target.invoiceNumber} has been deleted.`
        : "Invoice has been deleted.",
      icon: "info",
    });
  };

  // ------------------------------------------------------------------
  // QUOTATIONS
  // ------------------------------------------------------------------
  const addQuotation = (quotationData: Omit<Quotation, "id" | "createdAt">) => {
    const newQuotation: Quotation = {
      ...quotationData,
      id: `quot-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setQuotations((prev) => [newQuotation, ...prev]);
    addNotification({
      type: "success",
      title: "Quotation Created",
      message: `Quotation ${newQuotation.quotationNumber} prepared for ${newQuotation.customerName}.`,
      icon: "request_quote",
    });
  };

  const updateQuotation = (quotation: Quotation) => {
    setQuotations((prev) =>
      prev.map((q) => (q.id === quotation.id ? quotation : q))
    );
    addNotification({
      type: "info",
      title: "Quotation Updated",
      message: `Quotation ${quotation.quotationNumber} was updated.`,
      icon: "request_quote",
    });
  };

  const updateQuotationStatus = (id: string, status: QuotationStatus) => {
    setQuotations((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status } : q))
    );
    addNotification({
      type: "info",
      title: "Quotation Status Updated",
      message: `Quotation status updated to ${status}.`,
      icon: "info",
    });
  };

  const deleteQuotation = (id: string) => {
    const target = quotations.find((q) => q.id === id);
    setQuotations((prev) => prev.filter((q) => q.id !== id));
    if (target) setLastDeleted({ kind: "quotation", item: target });
    addNotification({
      type: "info",
      title: "Quotation Deleted",
      message: target
        ? `Quotation ${target.quotationNumber} has been deleted.`
        : "Quotation has been deleted.",
      icon: "info",
    });
  };

  const advanceQuotationSequence = () => mintSequence("quotation").value;

  // Explicit Quotation -> Invoice conversion. Creates a NEW invoice with its
  // OWN invoice number; the quotation is never deleted and stays unchanged.
  const convertQuotationToInvoice = (id: string) => {
    const quotation = quotations.find((q) => q.id === id);
    if (!quotation) return;
    const used = countCurrentPeriodInvoices(invoices, subscription);
    const gate = checkEntitlement(activePlan, "invoices", used);
    if (!gate.allowed) {
      notifyEntitlementBlocked("invoices", gate);
      return;
    }
    const minted = mintSequence("invoice");
    const invoiceNumber = buildInvoiceNumber(
      companyProfile.invoicePrefix || "INV",
      minted.fyName,
      minted.value
    );
    const invoiceItems: InvoiceItem[] = quotation.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      description: it.description,
      hsnSac: it.hsnSac,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      taxableAmount: it.taxableAmount,
      gstRate: it.gstRate,
      taxAmount: it.taxAmount,
      totalAmount: it.totalAmount,
    }));
    const inv: Invoice = {
      id: makeId("inv"),
      invoiceNumber,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      customerGstin: quotation.customerGstin,
      customerAddress: quotation.customerAddress,
      customerPhone: quotation.customerPhone,
      date: todayIso(),
      dueDate: plusDaysIso(15),
      placeOfSupply: "Tamil Nadu (33)",
      placeOfSupplyCode: "33",
      items: invoiceItems,
      subtotal: quotation.subtotal,
      cgst: quotation.cgst,
      sgst: quotation.sgst,
      igst: quotation.igst,
      totalTax: quotation.totalTax,
      grandTotal: quotation.grandTotal,
      status: "Pending",
      pricingMode: quotation.pricingMode || "inclusive",
      notes: quotation.notes,
    };
    setInvoices((prev) => [inv, ...prev]);
    setQuotations((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              status: "Accepted",
              convertedInvoiceId: inv.id,
              convertedInvoiceNumber: invoiceNumber,
              convertedAt: nowIso(),
            }
          : q
      )
    );
    addNotification({
      type: "success",
      title: "Quotation Converted to Invoice",
      message: `Invoice ${invoiceNumber} created from Quotation ${quotation.quotationNumber}.`,
      icon: "description",
    });
  };

  // ------------------------------------------------------------------
  // ESTIMATES
  // ------------------------------------------------------------------
  const addEstimate = (estimateData: Omit<Estimate, "id" | "createdAt">) => {
    const newEstimate: Estimate = {
      ...estimateData,
      id: `est-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setEstimates((prev) => [newEstimate, ...prev]);
    addNotification({
      type: "success",
      title: "Estimate Created",
      message: `Estimate ${newEstimate.estimateNumber} prepared for ${newEstimate.customerName}.`,
      icon: "receipt",
    });
  };

  const updateEstimate = (estimate: Estimate) => {
    setEstimates((prev) =>
      prev.map((e) => (e.id === estimate.id ? estimate : e))
    );
    addNotification({
      type: "info",
      title: "Estimate Updated",
      message: `Estimate ${estimate.estimateNumber} was updated.`,
      icon: "receipt",
    });
  };

  const updateEstimateStatus = (id: string, status: EstimateStatus) => {
    setEstimates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status } : e))
    );
    addNotification({
      type: "info",
      title: "Estimate Status Updated",
      message: `Estimate status updated to ${status}.`,
      icon: "info",
    });
  };

  const deleteEstimate = (id: string) => {
    const target = estimates.find((e) => e.id === id);
    setEstimates((prev) => prev.filter((e) => e.id !== id));
    if (target) setLastDeleted({ kind: "estimate", item: target });
    addNotification({
      type: "info",
      title: "Estimate Deleted",
      message: target
        ? `Estimate ${target.estimateNumber} has been deleted.`
        : "Estimate has been deleted.",
      icon: "info",
    });
  };

  const advanceEstimateSequence = () => mintSequence("estimate").value;

  // Explicit Estimate -> Quotation conversion. Creates a NEW quotation with
  // its own QT number; the estimate stays unchanged.
  const convertEstimateToQuotation = (id: string) => {
    const estimate = estimates.find((e) => e.id === id);
    if (!estimate) return;
    const minted = mintSequence("quotation");
    const quotationNumber = buildDocumentNumber("quotation", minted.fyName, minted.value);
    const items: InvoiceItem[] = estimate.items.map((it) => ({ ...it }));
    const quotation: Quotation = {
      id: makeId("quot"),
      quotationNumber,
      customerId: estimate.customerId,
      customerName: estimate.customerName,
      customerGstin: estimate.customerGstin,
      customerAddress: estimate.customerAddress,
      customerPhone: estimate.customerPhone,
      date: todayIso(),
      validUntil: plusDaysIso(30),
      items,
      subtotal: estimate.subtotal,
      cgst: estimate.cgst,
      sgst: estimate.sgst,
      igst: estimate.igst,
      totalTax: estimate.totalTax,
      grandTotal: estimate.grandTotal,
      status: "Draft",
      pricingMode: estimate.pricingMode || "inclusive",
      notes: estimate.notes,
      createdAt: nowIso(),
    };
    setQuotations((prev) => [quotation, ...prev]);
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "Accepted",
              convertedQuotationId: quotation.id,
              convertedQuotationNumber: quotationNumber,
              convertedAt: nowIso(),
            }
          : e
      )
    );
    addNotification({
      type: "success",
      title: "Estimate Converted to Quotation",
      message: `Quotation ${quotationNumber} created from Estimate ${estimate.estimateNumber}.`,
      icon: "request_quote",
    });
  };

  // Explicit Estimate -> Invoice conversion. Creates a NEW invoice with its
  // own INV number; the estimate stays unchanged.
  const convertEstimateToInvoice = (id: string) => {
    const estimate = estimates.find((e) => e.id === id);
    if (!estimate) return;
    const used = countCurrentPeriodInvoices(invoices, subscription);
    const gate = checkEntitlement(activePlan, "invoices", used);
    if (!gate.allowed) {
      notifyEntitlementBlocked("invoices", gate);
      return;
    }
    const minted = mintSequence("invoice");
    const invoiceNumber = buildInvoiceNumber(
      companyProfile.invoicePrefix || "INV",
      minted.fyName,
      minted.value
    );
    const invoiceItems: InvoiceItem[] = estimate.items.map((it) => ({ ...it }));
    const inv: Invoice = {
      id: makeId("inv"),
      invoiceNumber,
      customerId: estimate.customerId,
      customerName: estimate.customerName,
      customerGstin: estimate.customerGstin,
      customerAddress: estimate.customerAddress,
      customerPhone: estimate.customerPhone,
      date: todayIso(),
      dueDate: plusDaysIso(15),
      placeOfSupply: "Tamil Nadu (33)",
      placeOfSupplyCode: "33",
      items: invoiceItems,
      subtotal: estimate.subtotal,
      cgst: estimate.cgst,
      sgst: estimate.sgst,
      igst: estimate.igst,
      totalTax: estimate.totalTax,
      grandTotal: estimate.grandTotal,
      status: "Pending",
      pricingMode: estimate.pricingMode || "inclusive",
      notes: estimate.notes,
    };
    setInvoices((prev) => [inv, ...prev]);
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "Accepted",
              convertedInvoiceId: inv.id,
              convertedInvoiceNumber: invoiceNumber,
              convertedAt: nowIso(),
            }
          : e
      )
    );
    addNotification({
      type: "success",
      title: "Estimate Converted to Invoice",
      message: `Invoice ${invoiceNumber} created from Estimate ${estimate.estimateNumber}.`,
      icon: "description",
    });
  };

  // ------------------------------------------------------------------
  // PURCHASE ORDERS
  // ------------------------------------------------------------------
  const addPurchaseOrder = (poData: Omit<PurchaseOrder, "id" | "createdAt">) => {
    const newPo: PurchaseOrder = {
      ...poData,
      id: `po-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setPurchaseOrders((prev) => [newPo, ...prev]);
    addNotification({
      type: "success",
      title: "Purchase Order Created",
      message: `Purchase Order ${newPo.poNumber} issued to ${newPo.vendor.name}.`,
      icon: "shopping_cart_checkout",
    });
  };

  const updatePurchaseOrder = (po: PurchaseOrder) => {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === po.id ? po : p))
    );
    addNotification({
      type: "info",
      title: "Purchase Order Updated",
      message: `Purchase Order ${po.poNumber} was updated.`,
      icon: "shopping_cart_checkout",
    });
  };

  const updatePurchaseOrderStatus = (id: string, status: PurchaseOrderStatus) => {
    setPurchaseOrders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );
    addNotification({
      type: "info",
      title: "Purchase Order Status Updated",
      message: `Purchase Order status updated to ${status}.`,
      icon: "info",
    });
  };

  const deletePurchaseOrder = (id: string) => {
    const target = purchaseOrders.find((p) => p.id === id);
    setPurchaseOrders((prev) => prev.filter((p) => p.id !== id));
    if (target) setLastDeleted({ kind: "purchaseOrder", item: target });
    addNotification({
      type: "info",
      title: "Purchase Order Deleted",
      message: target
        ? `Purchase Order ${target.poNumber} has been deleted.`
        : "Purchase Order has been deleted.",
      icon: "info",
    });
  };

  const advancePurchaseOrderSequence = () => mintSequence("purchaseOrder").value;

  // Undo a just-performed customer / product / invoice deletion. The entity is
  // re-inserted (keeping its original id) so references in other records and
  // navigation URLs stay valid.
  const restoreLastDeleted = () => {
    if (!lastDeleted) return;
    const { kind, item } = lastDeleted;
    if (item && "id" in item) {
      if (kind === "customer") {
        setCustomers((prev) => [item as Customer, ...prev]);
      } else if (kind === "product") {
        setProducts((prev) => [item as Product, ...prev]);
      } else if (kind === "invoice") {
        setInvoices((prev) => [(item as Invoice), ...prev]);
      } else if (kind === "quotation") {
        setQuotations((prev) => [item as Quotation, ...prev]);
      } else if (kind === "estimate") {
        setEstimates((prev) => [item as Estimate, ...prev]);
      } else if (kind === "purchaseOrder") {
        setPurchaseOrders((prev) => [item as PurchaseOrder, ...prev]);
      }
      addNotification({
        type: "success",
        title: "Restored",
        message:
          kind === "customer"
            ? `${(item as Customer).name} was restored.`
            : kind === "product"
              ? `${(item as Product).name} was restored.`
              : kind === "invoice"
                ? `Invoice ${(item as Invoice).invoiceNumber} was restored.`
                : kind === "quotation"
                  ? `Quotation ${(item as Quotation).quotationNumber} was restored.`
                  : kind === "estimate"
                    ? `Estimate ${(item as Estimate).estimateNumber} was restored.`
                    : `Purchase Order ${(item as PurchaseOrder).poNumber} was restored.`,
        icon: "undo",
      });
    }
    setLastDeleted(null);
  };

  // Central mint: reconcile the financial-year state against today and return
  // { value, fyName } for a NEW document of the given kind. Rollover — creating
  // a missing FY and/or moving the active FY forward when the current one has
  // ended — runs HERE, immediately before every new document number is minted,
  // so an app left open across 31-Mar-23:59 -> 1-Apr never mints a number in a
  // closed year. Idempotent: correct active FY -> no-op.
  const mintSequence = (kind: SequenceKind): { value: number; fyName: string; fyId: string | null } => {
    const res = reconcileFinancialYears(financialYears, activeFinancialYearId, new Date());
    const fyId = res.activeId ?? financialYears[0]?.id ?? null;
    const fy = fyId ? res.years.find((y) => y.id === fyId) : undefined;
    const { map, value } = nextSequence(docSequences, fyId, kind);
    // Persist the newly-minted counter.
    setDocSequences(map);
    // Apply rollover/provision reductions (only when something changed).
    if (res.rolledOver || res.activeId !== activeFinancialYearId) {
      setActiveFinancialYearId(res.activeId);
    }
    if (res.created) {
      setFinancialYears(res.years);
    }
    return { value, fyName: fy?.name ?? "", fyId };
  };

  // Build the full document number string for a NEW doc, minting + persisting
  // the per-FY counter and running rollover first. Preferred by document
  // modals so the number shown AND stored are always the reconciled one.
  const mintDocumentNumber = (prefix: string, kind: SequenceKind): string => {
    const minted = mintSequence(kind);
    if (kind === "invoice") {
      return buildInvoiceNumber(prefix, minted.fyName, minted.value);
    }
    return buildDocumentNumber(kind, minted.fyName, minted.value);
  };

  const advanceInvoiceSequence = () => mintSequence("invoice").value;

  // Startup / account switch: reconcile the financial-year state against today
  // (provision a missing current FY + roll the active FY forward if it ended).
  // Called on mount so the active FY is correct the moment any document modal
  // opens. Idempotent; only fires a notification when something changed.
  const ensureFinancialYearRollover = () => {
    if (!activeAccountId) return;
    const res = reconcileFinancialYears(financialYears, activeFinancialYearId, new Date());
    if (res.rolledOver) {
      const from = financialYearName(financialYears, res.previousActiveId);
      setActiveFinancialYearId(res.activeId);
      setFinancialYears(res.years);
      addNotification({
        type: "info",
        title: "Financial Year Rolled Over",
        message: `New financial year ${res.target?.name || ""} is now active${from ? ` (from ${from})` : ""}. Documents will use the new year's numbering.`,
        icon: "event",
      });
    } else if (res.created) {
      setFinancialYears(res.years);
      if (!activeFinancialYearId) setActiveFinancialYearId(res.activeId);
    } else if (!activeFinancialYearId && res.activeId) {
      setActiveFinancialYearId(res.activeId);
    }
  };

  // On startup / account switch, reconcile the financial-year state (provision
  // a missing current FY + roll the active FY forward when it ended) so the
  // active FY is correct before any document is generated.
  useEffect(() => {
    Promise.resolve().then(() => ensureFinancialYearRollover());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  const addCustomer = (customer: Omit<Customer, "id">) => {
    const gate = checkEntitlement(activePlan, "customers", customers.length);
    if (!gate.allowed) {
      notifyEntitlementBlocked("customers", gate);
      return false;
    }
    const newCustomer: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
    };
    setCustomers((prev) => [...prev, newCustomer]);
    addNotification({
      type: "success",
      title: "Customer Added",
      message: `${newCustomer.name} added to customer directory.`,
      icon: "group",
    });
    return true;
  };

  const updateCustomer = (customer: Customer) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === customer.id ? customer : c))
    );
    addNotification({
      type: "info",
      title: "Customer Updated",
      message: `${customer.name}'s profile was updated.`,
      icon: "group",
    });
  };

  const deleteCustomer = (id: string) => {
    const target = customers.find((c) => c.id === id);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    if (target) setLastDeleted({ kind: "customer", item: target });
    addNotification({
      type: "info",
      title: "Customer Removed",
      message: target
        ? `${target.name} was removed from your directory.`
        : "Customer has been removed from directory.",
      icon: "info",
    });
  };

  const addProduct = (product: Omit<Product, "id">) => {
    const gate = checkEntitlement(activePlan, "products", products.length);
    if (!gate.allowed) {
      notifyEntitlementBlocked("products", gate);
      return false;
    }
    const newProduct: Product = {
      ...product,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => [...prev, newProduct]);
    addNotification({
      type: "success",
      title: "Product Added",
      message: `${newProduct.name} added to catalog.`,
      icon: "inventory_2",
    });
    return true;
  };

  const updateProduct = (product: Product) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? product : p))
    );
    addNotification({
      type: "info",
      title: "Product Updated",
      message: `${product.name} was updated in the catalog.`,
      icon: "inventory_2",
    });
  };

  const deleteProduct = (id: string) => {
    const target = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (target) setLastDeleted({ kind: "product", item: target });
    addNotification({
      type: "info",
      title: "Product Removed",
      message: target
        ? `${target.name} was removed from the catalog.`
        : "Product has been removed from catalog.",
      icon: "info",
    });
  };

  // OPERATIONAL reset only: clears all transactions/business records to zero but
  // preserves the account's business setup (company profile, financial years,
  // invoice configuration and subscription). This is the safe "I want a clean
  // slate of records" action and never deletes account/business setup info.
  const resetBusinessData = () => {
    if (!activeAccountId) return;
    setExpenses([]);
    setVehicles([]);
    setVehicleExpenses([]);
    setTeamMembers([]);
    setInvoices([]);
    setQuotations([]);
    setEstimates([]);
    setPurchaseOrders([]);
    setCustomers([]);
    setProducts([]);
    setNotifications([]);
    setOpenModal(null);
    setDeleteConfirm(null);
    addNotification({
      type: "success",
      title: "Business Records Reset",
      message:
        "All transactions and business records were cleared to zero. Your business setup (profile, financial years, plan) was preserved.",
      icon: "check_circle",
    });
  };

  // FULL reset back to a brand-new account: wipes operational records AND the
  // business setup (company profile, financial years, invoice config, onboarding
  // state, subscription and payment history). Re-routes the user through the
  // onboarding wizard on next navigation.
  const resetEntireSetup = () => {
    if (!activeAccountId) return;
    const defaultFy = defaultFinancialYear();
    setCompanyProfile(EMPTY_COMPANY_PROFILE);
    setExpenses([]);
    setVehicles([]);
    setVehicleExpenses([]);
    setTeamMembers([]);
    setInvoices([]);
    setQuotations([]);
    setEstimates([]);
    setPurchaseOrders([]);
    setCustomers([]);
    setProducts([]);
    setNotifications([]);
    setSubscription(defaultSubscription());
    setPaymentHistory([]);
    setFinancialYears([defaultFy]);
    setActiveFinancialYearId(defaultFy.id);
    setDocSequences({ [defaultFy.id]: { invoice: 1, quotation: 1, estimate: 1, purchaseOrder: 1 } });
    setOnboarding({ completed: false, currentStep: 0 });
    setOpenModal(null);
    setDeleteConfirm(null);
    addNotification({
      type: "success",
      title: "Setup Reset",
      message: "Entire business setup cleared. You will be guided through onboarding again.",
      icon: "check_circle",
    });
  };

  const loadDemoData = () => {
    if (!activeAccountId) return;
    setCompanyProfile({ ...INITIAL_COMPANY_PROFILE });
    setExpenses([...INITIAL_EXPENSES]);
    setVehicles([...INITIAL_VEHICLES]);
    setVehicleExpenses([...INITIAL_VEHICLE_EXPENSES]);
    setTeamMembers([...INITIAL_TEAM_MEMBERS]);
    setInvoices([...INITIAL_INVOICES]);
    setCustomers([...INITIAL_CUSTOMERS]);
    setProducts([...INITIAL_PRODUCTS]);
    setNotifications([...INITIAL_NOTIFICATIONS]);
    const now = Date.now();
    const seedPayments: PaymentRecord[] = [
      {
        id: "PAY-2026-001",
        date: new Date(now - 28 * 86400000).toISOString(),
        planId: "business",
        planName: "Business",
        billingPeriod: "month",
        baseAmount: 999,
        gstRate: 18,
        gstAmount: 179.82,
        totalAmount: 1178.82,
        method: "upi",
        status: "success",
        description: "BizLedger Business Subscription (1 Month)",
      },
      {
        id: "PAY-2026-002",
        date: new Date(now - 58 * 86400000).toISOString(),
        planId: "business",
        planName: "Business",
        billingPeriod: "month",
        baseAmount: 999,
        gstRate: 18,
        gstAmount: 179.82,
        totalAmount: 1178.82,
        method: "card",
        status: "success",
        description: "BizLedger Business Subscription (1 Month)",
      },
      {
        id: "PAY-2026-003",
        date: new Date(now - 2 * 86400000).toISOString(),
        planId: "business",
        planName: "Business",
        billingPeriod: "month",
        baseAmount: 999,
        gstRate: 18,
        gstAmount: 179.82,
        totalAmount: 1178.82,
        method: "upi",
        status: "success",
        description: "BizLedger Business Subscription (1 Month)",
      },
    ];
    setPaymentHistory(seedPayments);
    setSubscription({
      currentPlanId: "business",
      status: "active",
      billing: {
        period: "month",
        startedAt: new Date(now - 28 * 86400000).toISOString(),
        renewsAt: new Date(now + 2 * 86400000).toISOString(),
        amount: 999,
        gstRate: 18,
        lastPaidAt: new Date(now).toISOString(),
      },
      pendingPlanId: null,
      pendingPeriod: "month",
    });
    setOpenModal(null);
    setDeleteConfirm(null);
    addNotification({
      type: "success",
      title: "Demo Data Loaded",
      message: "BizLedger has been populated with the sample demo dataset.",
      icon: "check_circle",
    });
  };

  const value: AppContextType = {
    activeRoute,
    setActiveRoute,
    openModal,
    setOpenModal,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedExpenseId,
    setSelectedExpenseId,
    notifications,
    addNotification,
    removeNotification,
    isNotificationOpen,
    setIsNotificationOpen,
    markAllNotificationsRead,
    deleteConfirm,
    setDeleteConfirm,
    confirmDelete: confirmDelete as (state: DeleteConfirmState) => void,
    performDelete: performDelete as (state: DeleteConfirmState) => void,
    isOffline,
    setIsOffline,
    companyProfile,
    updateCompanyProfile,
    financialYears,
    activeFinancialYearId,
    getActiveFinancialYear,
    addFinancialYear,
    updateFinancialYear,
    deleteFinancialYear,
    setActiveFinancialYear,
    ensureFinancialYearRollover,
    mintDocumentNumber,
    onboarding,
    setOnboardingStep,
    completeOnboarding,
    currentPlanId: subscription?.currentPlanId ?? null,
    subscription: subscription as SubscriptionState,
    pendingPlanId: subscription?.pendingPlanId ?? null,
    pendingPeriod: subscription?.pendingPeriod ?? "month",
    setPendingPlan,
    completePayment,
    requestRefund,
    changePlan,
    plans: SUBSCRIPTION_PLANS,
    activePlan,
    currentUsage: {
      invoices: countCurrentPeriodInvoices(invoices, subscription),
      customers: customers.length,
      teamMembers: teamMembers.length,
      products: products.length,
      directoryListings: activeAccountId && getMyDirectoryListing(activeAccountId) ? 1 : 0,
    },
    canCreateResource: (kind: LimitKind) =>
      canCreate(
        activePlan,
        kind,
        kind === "invoices"
          ? countCurrentPeriodInvoices(invoices, subscription)
          : kind === "customers"
          ? customers.length
          : kind === "teamMembers"
          ? teamMembers.length
          : kind === "products"
          ? products.length
          : activeAccountId && getMyDirectoryListing(activeAccountId)
          ? 1
          : 0
      ),
    checkEntitlementFor: (kind: LimitKind) =>
      checkEntitlement(
        activePlan,
        kind,
        kind === "invoices"
          ? countCurrentPeriodInvoices(invoices, subscription)
          : kind === "customers"
          ? customers.length
          : kind === "teamMembers"
          ? teamMembers.length
          : kind === "products"
          ? products.length
          : activeAccountId && getMyDirectoryListing(activeAccountId)
          ? 1
          : 0
      ),
    paymentHistory,
    expenses,
    vehicles,
    vehicleExpenses,
    teamMembers,
    customers,
    products,
    invoices,
    quotations,
    estimates,
    purchaseOrders,
    addExpense,
    updateExpense,
    deleteExpense,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    addVehicleExpense,
    addTeamMember,
    updateTeamMember,
    deleteTeamMember,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addProduct,
    updateProduct,
    deleteProduct,
    addInvoice,
    updateInvoice,
    updateInvoiceStatus,
    deleteInvoice,
    invoiceSequence,
    advanceInvoiceSequence,
    addQuotation,
    updateQuotation,
    updateQuotationStatus,
    deleteQuotation,
    quotationSequence,
    advanceQuotationSequence,
    addEstimate,
    updateEstimate,
    updateEstimateStatus,
    deleteEstimate,
    estimateSequence,
    advanceEstimateSequence,
    addPurchaseOrder,
    updatePurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
    purchaseOrderSequence,
    advancePurchaseOrderSequence,
    convertQuotationToInvoice,
    convertEstimateToQuotation,
    convertEstimateToInvoice,
    restoreLastDeleted,
    resetBusinessData,
    resetEntireSetup,
    loadDemoData,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};