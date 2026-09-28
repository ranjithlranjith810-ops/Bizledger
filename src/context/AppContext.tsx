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
import { resolveInitialOnboardingState } from "@/lib/constants";
import { http, ApiError } from "@/lib/api-client";
import { billingApi } from "@/lib/api/billing";
import { customersApi, toBackendInput as customerToBackendInput } from "@/lib/api/customers";
import { productsApi } from "@/lib/api/products";
import { financialYearsApi, toFrontend as fyToFrontend, FinancialYearBackend } from "@/lib/api/financialYears";
import { invoicesApi, toBackendInput as invoiceToBackendInput, fromBackendInvoice } from "@/lib/api/invoices";
import { quotationsApi, toBackendInput as quotationToBackendInput, fromBackendQuotation } from "@/lib/api/quotations";
import { estimatesApi, toBackendInput as estimateToBackendInput, fromBackendEstimate } from "@/lib/api/estimates";
import { purchaseOrdersApi, toBackendInput as poToBackendInput, fromBackendPurchaseOrder } from "@/lib/api/purchaseOrders";
import { expensesApi, toBackendInput as expenseToBackendInput, toBackendUpdateInput as expenseToBackendUpdateInput, fromBackendExpense } from "@/lib/api/expenses";
import { vehiclesApi, toBackendInput as vehicleToBackendInput, fromBackendVehicle } from "@/lib/api/vehicles";
import { teamApi, toBackendInput as teamToBackendInput, fromBackendMember } from "@/lib/api/team";
import { notificationsApi, fromBackendNotification } from "@/lib/api/notifications";
import { notifyBusinessScopeChanged } from "@/lib/business-scope";
import { useAuth } from "@/context/AuthContext";
import {
  buildInvoiceNumber,
  buildDocumentNumber,
  resolveTaxType,
  splitTaxType,
} from "@/lib/invoice";
import { stateWithCode } from "@/lib/india";
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
  countCurrentPeriodInvoices,
  canCreate,
  checkEntitlement,
  EntitlementResult,
  LimitKind,
  getUsage,
  usageForKind,
  ResourceUsage,
} from "@/lib/entitlements";
import { getEffectivePlan } from "@/lib/plans";
import { getMyDirectoryListingCache } from "@/lib/directory";
import {
  defaultSubscriptionState,
  deriveSubscriptionStatus,
  resolveServerSubscription,
  SubscriptionLifecycle,
} from "@/lib/billing/subscription-loader";

const AppContext = createContext<AppContextType | undefined>(undefined);

// localStorage-backed hydration is retired: the backend (PostgreSQL) is now the
// source of truth for all per-domain entity state. readStorage therefore always
// returns the fallback so ignored stale keyed data can never re-enter state.
function readStorage<T>(key: string, fallback: T): () => T {
  return () => fallback;
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

// Team-seat count for entitlement purposes. The account owner is NOT a paid
// team-member seat — only ADDITIONAL (non-owner) members count against the
// plan's teamMember ceiling. This keeps the Free plan's 0 extra seats from
// consuming the owner (who may always use the app).
function additionalTeamSeatsUsed(members: TeamMember[]): number {
  return members.filter((m) => m.role !== "Owner").length;
}

// Derive a place-of-supply pair from a customer's billing state. This must
// NEVER fall back to a hard-coded seller state — if we cannot prove the POS we
// leave it empty and the GST engine resolves to intrastate (CGST+SGST), which
// is the conservative, correct classification for an unproven destination.
function placeOfSupplyFromState(customerState: string): {
  placeOfSupply: string;
  placeOfSupplyCode: string;
} {
  const formatted = stateWithCode(customerState || "");
  if (!formatted) return { placeOfSupply: "", placeOfSupplyCode: "" };
  const m = /\((\d+)\)/.exec(formatted);
  return { placeOfSupply: formatted, placeOfSupplyCode: m ? m[1] : "" };
}

// Seller state code extracted from the company profile state (canonical code,
// not display name). Empty when the profile state is not a known state.
function sellerStateCode(stateName: string): string {
  const formatted = stateWithCode(stateName || "");
  const m = /\((\d+)\)/.exec(formatted);
  return m ? m[1] : "";
}

export const AppProvider: React.FC<{
  children: React.ReactNode;
  activeBusinessId?: string | null;
}> = ({ children, activeBusinessId: businessId = null }) => {
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
  // they are routed through /onboarding before reaching the dashboard. The
  // initial value is derived from the resolved backend business: a returning
  // account that already created its tenant resumes onboarded (full page loads,
  // refreshes, and native back navigation all restore completion correctly,
  // instead of the retired localStorage hydration that reset to incomplete).
  const [onboarding, setOnboarding] = useState<OnboardingState>(() =>
    resolveInitialOnboardingState({ activeAccountId, businessId })
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

  // Backend-known financial year ids (null = backend not consulted yet for this
  // business scope). Drives the sync of locally-created years to the backend.
  const [backendFyIds, setBackendFyIds] = useState<string[] | null>(null);

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

  const completeOnboarding = async () => {
    setOnboarding((prev) => ({ ...prev, completed: true, currentStep: 6 }));
    // The backend business is the tenant scope for every API request. Create it
    // from the onboarding company profile when this is the user's first business
    // (a fresh auth user has none yet). The scope provider re-resolves and
    // updates activeBusinessId so later requests are correctly tenanted.
    if (activeAccountId && businessId === null && companyProfile.companyName.trim()) {
      try {
        const created = await http.post<{ id: string }>("/api/businesses", {
          name: companyProfile.companyName.trim(),
          legalName: companyProfile.companyName.trim(),
        });
        if (created?.id) {
          // Backfill the onboarding-created financial years (they were saved
          // locally while no business existed yet) and activate the active one.
          for (const fy of financialYears) {
            await financialYearsApi
              .create(created.id, { name: fy.name, startDate: fy.startDate, endDate: fy.endDate })
              .then((res) => {
                if (res?.financialYear?.id && activeFinancialYearId === fy.id) {
                  void financialYearsApi.activate(created.id, res.financialYear.id).catch(() => {});
                }
              })
              .catch(() => {});
          }
          notifyBusinessScopeChanged();
        }
      } catch {
        // The wizard still completes locally; the next reload re-attempts via
        // the scope provider's GET /api/businesses when the backend is up.
      }
    }
  };

  // Domain 5: financial years are backend-authoritative once the scope resolves.
  // When the backend has years they REPLACE the local cache (server decides name
  // and the single active year). An empty backend (pre-onboarding) leaves the
  // local default years in place so the wizard stays usable.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    financialYearsApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const list: FinancialYearBackend[] = Array.isArray(data.financialYears)
          ? data.financialYears
          : [];
        if (list.length > 0) {
          const mapped = list.map(fyToFrontend);
          setFinancialYears(mapped);
          const activeFy = list.find((f) => f.isActive) ?? list[0];
          if (activeFy) setActiveFinancialYearId(activeFy.id);
          setBackendFyIds(mapped.map((m) => m.id));
        } else {
          setBackendFyIds([]);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Sync a financial year to the backend inside the given business scope.
  const syncFy = (bizId: string, fy: FinancialYearSettings) => {
    void (async () => {
      try {
        const { financialYear } = await financialYearsApi.create(bizId, {
          name: fy.name,
          startDate: fy.startDate,
          endDate: fy.endDate,
        });
        if (financialYear?.id) {
          const mapped = fyToFrontend(financialYear);
          setFinancialYears((prev) =>
            prev.map((y) => (y.id === fy.id ? mapped : y)),
          );
          if (activeFinancialYearId === fy.id) {
            setActiveFinancialYearId(mapped.id);
            if (financialYear.isActive !== true) {
              await financialYearsApi.activate(bizId, mapped.id).catch(() => {});
            }
          }
          setBackendFyIds((prev) =>
            prev ? [...prev, mapped.id] : [mapped.id],
          );
        }
      } catch {
        // Backend not ready (e.g. offline): the local years remain usable and
        // the next successful scope load reconciles them.
      }
    })();
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
    if (businessId) syncFy(businessId, next);
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
    if (businessId && id) {
      financialYearsApi.activate(businessId, id).catch(() => {
        addNotification({
          type: "error",
          title: "Could Not Switch Year",
          message:
            "The active financial year could not be saved to the server. Reload the app to revert.",
          icon: "error",
        });
      });
    }
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

  const defaultSubscription = (): SubscriptionState => defaultSubscriptionState();

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

  // Explicit subscription lifecycle: loading → ready | error. This is distinct
  // from status "none" — it represents "server answer pending" vs "server
  // confirmed no paid subscription". The billing page uses this to render
  // skeleton during loading and an error panel on failure, never falsely Free.
  //
  // `ready`/`error` are stored alongside the businessId they belong to; the
  // exposed `subscriptionStatus` is DERIVED in render so a business change shows
  // "loading" without a synchronous setState (which would trigger cascading
  // renders per the compiler lint rule).
  const [subscriptionLifecycle, setSubscriptionLifecycle] = useState<SubscriptionLifecycle>({
    businessId: null,
    status: "ready",
  });
  const subscriptionStatus = deriveSubscriptionStatus(businessId, subscriptionLifecycle);
  const [subscriptionReloadKey, setSubscriptionReloadKey] = useState(0);
  const retrySubscription = () => setSubscriptionReloadKey((k) => k + 1);

  // ACTIVE plan derived from subscription state (a failed/cancelled payment keeps
  // the previous plan active; only a successful payment switches it).
  // `getEffectivePlan` NEVER returns null for a valid account — when there is no
  // paid plan it resolves to the Free (base) plan, so entitlements like customers
  // 2 / products 5 / team 0 / invoices 5 correctly govern instead of collapsing
  // to 0 (which previously surfaced as misleading "allows up to 0 X" messages).
  const activePlan = getEffectivePlan(subscription);

  // Backend subscription sync: once the webhook activates a paid subscription,
  // the server is authoritative. `billingApi.getSubscription` returns the ACTIVE
  // subscription (or null when the business has none), and only activation is
  // applied here — a paid plan never reverts below the Free plan, and a missing
  // answer (backend down / still PENDING) leaves the current state untouched.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    billingApi
      .getSubscription(businessId)
      .then((data) => {
        if (!active) return;
        setSubscription((prev) =>
          resolveServerSubscription(prev, data?.subscription),
        );
        setSubscriptionLifecycle({ businessId, status: "ready" });
      })
      .catch(() => {
        if (!active) return;
        setSubscriptionLifecycle({ businessId, status: "error" });
        // Do NOT touch subscription state — keep whatever we had.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, subscriptionReloadKey]);

  // Emit a consistent upgrade-prompt notification when an action is blocked by
  // the active plan's entitlement limits. The wording is resource-aware so the
  // message never mislabels one resource (e.g. "team members") for another or
  // implies a lifetime cap is a billing-period cap (and vice-versa).
  const notifyEntitlementBlocked = (kind: LimitKind, result: EntitlementResult) => {
    const planName = activePlan?.name ?? "your current plan";
    let message: string;
    if (kind === "invoices") {
      message = `You've used all ${result.limit} invoices allowed by ${planName} this month. Upgrade your plan to create more.`;
    } else {
      const label =
        kind === "customers"
          ? "customers"
          : kind === "teamMembers"
          ? "team members"
          : kind === "directoryListing"
          ? "directory listings"
          : "products";
      const focus =
        kind === "teamMembers"
          ? "You can use this app as an owner; inviting additional team members requires an upgrade."
          : `You've reached the ${label} limit (${result.limit}) for ${planName}.`;
      message = `${focus} Upgrade your plan to continue.`;
    }
    addNotification({
      type: "warning",
      title: `${capitalize(
        kind === "directoryListing" ? "directory listing" : kind === "invoices" ? "invoice" : kind === "teamMembers" ? "team member" : kind
      )} limit reached`,
      message,
      icon: "workspace_premium",
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
  // Read-only per-FY sequence read so a date-derived number preview can use the
  // counter of the year the DATE falls in (stays internally consistent; the
  // authoritative number is always minted server-side at submit).
  const documentSequenceFor = (fyId: string | null, kind: SequenceKind): number =>
    getSequence(docSequences, fyId, kind);

  // Most-recently deleted entity, kept in memory so the user can Undo a
  // customer / product / invoice deletion from its toast before leaving.
  const [lastDeleted, setLastDeleted] = useState<{
    kind: DeleteEntityKind;
    item: Customer | Product | Invoice | Quotation | Estimate | PurchaseOrder;
  } | null>(null);

  

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
    void notificationsApi.dismiss(id).catch(() => {});
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void notificationsApi.markAllRead(businessId || undefined).catch(() => {});
  };

  // Mark a SINGLE notification as read (the per-item "Mark as Read" action).
  // Persisted via the notifications effect so read-state survives a reload.
  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    void notificationsApi.markRead(id).catch(() => {});
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
    const tempId = `exp-${Date.now()}`;
    const optimistic: Expense = {
      ...newExpData,
      id: tempId,
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [optimistic, ...prev]);
    if (businessId) {
      void (async () => {
        try {
          const { expense: created } = await expensesApi.create(
            businessId,
            expenseToBackendInput(optimistic),
          );
          if (created?.id) {
            setExpenses((prev) =>
              prev.map((e) => (e.id === tempId ? fromBackendExpense(created) : e)),
            );
          }
        } catch {
          setExpenses((prev) => prev.filter((e) => e.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Expense",
            message: "The expense could not be saved to the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Expense Recorded",
      message: `Expense ${optimistic.expenseNumber} for ₹${optimistic.amount.toLocaleString("en-IN")} was saved successfully.`,
      icon: "check_circle",
    });
  };

  const updateExpense = (expense: Expense) => {
    setExpenses((prev) =>
      prev.map((exp) => (exp.id === expense.id ? expense : exp))
    );
    if (businessId) {
      void (async () => {
        try {
          const { expense: updated } = await expensesApi.update(
            businessId,
            expense.id,
            expenseToBackendUpdateInput(expense),
          );
          if (updated?.id) {
            setExpenses((prev) =>
              prev.map((e) => (e.id === updated.id ? fromBackendExpense(updated) : e)),
            );
          }
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Update Expense",
            message: "The expense update could not be saved to the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
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
    if (businessId) {
      void (async () => {
        try {
          await expensesApi.remove(businessId, id);
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Delete Expense",
            message: "The expense could not be deleted on the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "info",
      title: "Expense Removed",
      message: target ? `Expense ${target.expenseNumber} has been deleted.` : "Expense deleted.",
      icon: "info",
    });
  };

  const addVehicle = (vehData: Omit<Vehicle, "id" | "totalExpenses" | "fuelExpenses" | "maintenanceExpenses" | "tollExpenses" | "otherExpenses">) => {
    const tempId = `veh-${Date.now()}`;
    const optimistic: Vehicle = {
      ...vehData,
      id: tempId,
      totalExpenses: 0,
      fuelExpenses: 0,
      maintenanceExpenses: 0,
      tollExpenses: 0,
      otherExpenses: 0,
    };
    setVehicles((prev) => [optimistic, ...prev]);
    if (businessId) {
      void (async () => {
        try {
          const { vehicle: created } = await vehiclesApi.create(
            businessId,
            vehicleToBackendInput(optimistic),
          );
          if (created?.id) {
            setVehicles((prev) =>
              prev.map((v) =>
                v.id === tempId ? fromBackendVehicle(created) : v,
              ),
            );
          }
        } catch {
          setVehicles((prev) => prev.filter((v) => v.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Add Vehicle",
            message: "The vehicle could not be saved to the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Vehicle Added",
      message: `Vehicle ${optimistic.registrationNumber} (${optimistic.makeModel}) registered in fleet.`,
      icon: "local_shipping",
    });
  };

  const updateVehicle = (vehicle: Vehicle) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === vehicle.id ? vehicle : v))
    );
    if (businessId) {
      void (async () => {
        try {
          const { vehicle: updated } = await vehiclesApi.update(
            businessId,
            vehicle.id,
            vehicleToBackendInput(vehicle),
          );
          if (updated?.id) {
            setVehicles((prev) =>
              prev.map((v) =>
                v.id === updated.id ? fromBackendVehicle(updated) : v,
              ),
            );
          }
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Update Vehicle",
            message: "The vehicle update could not be saved to the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
  };

  const deleteVehicle = (id: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    if (businessId) {
      void (async () => {
        try {
          await vehiclesApi.remove(businessId, id);
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Delete Vehicle",
            message: "The vehicle could not be deleted on the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
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
    // The linked expense is persisted to the backend (POST /api/expenses with the
    // vehicleId link) so it survives reloads and feeds the vehicle's server-side
    // expense aggregates. The vehicleExpenses record stays a local UI mirror.
    const tempExpId = linkedExpense.id;
    setExpenses((prev) => [linkedExpense, ...prev]);

    const applyVehicleTotals = (dir: 1 | -1) => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.id === veData.vehicleId) {
            const isFuel = veData.category === "Fuel";
            const isMaint =
              veData.category === "Service & Maintenance" ||
              veData.category === "Tyre" ||
              veData.category === "Repairs";
            const isToll = veData.category === "Fastag / Toll";
            const delta = dir * veData.amount;
            return {
              ...v,
              currentOdometer:
                dir === 1
                  ? Math.max(v.currentOdometer, veData.odometerReading || 0)
                  : v.currentOdometer,
              totalExpenses: v.totalExpenses + delta,
              fuelExpenses: isFuel ? v.fuelExpenses + delta : v.fuelExpenses,
              maintenanceExpenses: isMaint ? v.maintenanceExpenses + delta : v.maintenanceExpenses,
              tollExpenses: isToll ? v.tollExpenses + delta : v.tollExpenses,
              otherExpenses: !isFuel && !isMaint && !isToll ? v.otherExpenses + delta : v.otherExpenses,
              lastServiceDate: isMaint && dir === 1 ? veData.date : v.lastServiceDate,
            };
          }
          return v;
        })
      );
    };
    applyVehicleTotals(1);

    if (businessId) {
      void (async () => {
        try {
          const { expense: created } = await expensesApi.create(
            businessId,
            expenseToBackendInput(linkedExpense),
          );
          if (created?.id) {
            setExpenses((prev) =>
              prev.map((e) => (e.id === tempExpId ? fromBackendExpense(created) : e)),
            );
          }
        } catch {
          // Roll back the optimistic mirrors so the UI matches the server.
          setExpenses((prev) => prev.filter((e) => e.id !== tempExpId));
          setVehicleExpenses((prev) => prev.filter((x) => x.id !== newVE.id));
          applyVehicleTotals(-1);
          addNotification({
            type: "error",
            title: "Could Not Log Vehicle Expense",
            message: "The vehicle expense could not be saved to the server. No expense was recorded.",
            icon: "error",
          });
          return;
        }
      })();
    }

    addNotification({
      type: "success",
      title: "Vehicle Expense Logged",
      message: `₹${veData.amount.toLocaleString("en-IN")} for ${veData.vehicleRegistration} recorded.`,
      icon: "local_shipping",
    });
  };

  const addTeamMember = (memData: Omit<TeamMember, "id" | "lastActive" | "joinedDate">) => {
    const additionalSeatsUsed = additionalTeamSeatsUsed(teamMembers);
    const gate = checkEntitlement(activePlan, "teamMembers", additionalSeatsUsed);
    if (!gate.allowed) {
      notifyEntitlementBlocked("teamMembers", gate);
      return false;
    }
    const tempId = `tm-${Date.now()}`;
    const optimistic: TeamMember = {
      ...memData,
      id: tempId,
      lastActive: "Never (Invitation sent)",
      joinedDate: new Date().toISOString().split("T")[0],
    };
    setTeamMembers((prev) => [...prev, optimistic]);
    if (businessId) {
      void (async () => {
        try {
          const { member: created } = await teamApi.invite(
            businessId,
            teamToBackendInput(optimistic),
          );
          if (created?.id) {
            setTeamMembers((prev) =>
              prev.map((m) =>
                m.id === tempId ? fromBackendMember(created) : m,
              ),
            );
          }
        } catch {
          setTeamMembers((prev) => prev.filter((m) => m.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Invite Member",
            message: "The invitation could not be sent to the server. No invitation was created.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Team Member Invited",
      message: `Invitation email dispatched to ${optimistic.email} with ${optimistic.role} role.`,
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
    if (businessId) {
      void (async () => {
        try {
          await teamApi.remove(businessId, id);
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Remove Member",
            message: "The team member could not be removed on the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
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
      message: "Company details updated successfully.",
      icon: "check_circle",
    });
  };

  // NOTE: No arbitrary `changePlan` mutation is exposed. A plan may only change
  // via the checkout/payment flow (`setPendingPlan` + `completePayment("success")`)
  // which the account owner/admin drives — a user cannot silently hand-switch to
  // a paid plan or override plan limits. (Admin assignment arrives in the
  // backend phase via `fetchPlanCatalog` / the subscription API.)

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
    const tempId = `inv-${Date.now()}`;
    const optimistic: Invoice = {
      ...invData,
      id: tempId,
    };
    setInvoices((prev) => [optimistic, ...prev]);
    // The backend is the source of truth for the number and totals: the create
    // mints the number atomically and recomputes the GST split server-side.
    // When it succeeds the optimistic row is swapped for the authoritative one;
    // when it fails the optimistic row is reverted.
    if (businessId && activeFyId) {
      void (async () => {
        try {
          const { invoice: created } = await invoicesApi.create(
            businessId,
            invoiceToBackendInput(optimistic, {
              financialYearId: activeFyId,
              prefix: companyProfile.invoicePrefix || "INV",
              company: companyProfile,
            }),
          );
          if (created?.id) {
            setInvoices((prev) =>
              prev.map((inv) =>
                inv.id === tempId ? fromBackendInvoice(created) : inv,
              ),
            );
          }
        } catch {
          setInvoices((prev) => prev.filter((inv) => inv.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Invoice",
            message:
              "The invoice could not be saved to the server. Your invoice was not saved.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Invoice Created",
      message: `Invoice ${optimistic.invoiceNumber} generated for ${optimistic.customerName}.`,
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
    const tempId = `quot-${Date.now()}`;
    const optimistic: Quotation = {
      ...quotationData,
      id: tempId,
      createdAt: new Date().toISOString(),
    };
    setQuotations((prev) => [optimistic, ...prev]);
    if (businessId && activeFyId) {
      void (async () => {
        try {
          const { quotation: created } = await quotationsApi.create(
            businessId,
            quotationToBackendInput(optimistic, {
              financialYearId: activeFyId,
              prefix: "QT",
              company: companyProfile,
            }),
          );
          if (created?.id) {
            setQuotations((prev) =>
              prev.map((q) =>
                q.id === tempId ? fromBackendQuotation(created) : q,
              ),
            );
          }
        } catch {
          setQuotations((prev) => prev.filter((q) => q.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Quotation",
            message:
              "The quotation could not be saved to the server. Your quotation was not saved.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Quotation Created",
      message: `Quotation ${optimistic.quotationNumber} prepared for ${optimistic.customerName}.`,
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
  // The backend mints the number and marks the quotation Accepted + converted
  // in the same transaction (sourceDocument), so the stored invoice and the
  // converted-quotation reference always agree.
  const convertQuotationToInvoice = (id: string) => {
    const quotation = quotations.find((q) => q.id === id);
    if (!quotation || quotation.convertedInvoiceId) return;
    const used = countCurrentPeriodInvoices(invoices, subscription);
    const gate = checkEntitlement(activePlan, "invoices", used);
    if (!gate.allowed) {
      notifyEntitlementBlocked("invoices", gate);
      return;
    }
    const tempId = makeId("inv");
    const invoiceItems: InvoiceItem[] = quotation.items.map((it) => ({ ...it }));
    const customer = customers.find((c) => c.id === quotation.customerId);
    const pos = placeOfSupplyFromState(customer?.billingAddress?.state || "");
    const taxType = resolveTaxType(sellerStateCode(companyProfile.state), pos.placeOfSupplyCode);
    const split = splitTaxType(quotation.totalTax || 0, taxType);
    const preview: Invoice = {
      id: tempId,
      invoiceNumber: "",
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      customerGstin: quotation.customerGstin,
      customerAddress: quotation.customerAddress,
      customerPhone: quotation.customerPhone,
      date: todayIso(),
      dueDate: plusDaysIso(15),
      placeOfSupply: pos.placeOfSupply,
      placeOfSupplyCode: pos.placeOfSupplyCode,
      items: invoiceItems,
      subtotal: quotation.subtotal,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      totalTax: quotation.totalTax,
      grandTotal: quotation.grandTotal,
      status: "Pending",
      pricingMode: quotation.pricingMode || "inclusive",
      notes: quotation.notes,
    };
    const persist = (created: Invoice) => {
      setInvoices((prev) => prev.map((inv) => (inv.id === tempId ? created : inv)));
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: "Accepted",
                convertedInvoiceId: created.id,
                convertedInvoiceNumber: created.invoiceNumber,
                convertedAt: nowIso(),
              }
            : q
        )
      );
      addNotification({
        type: "success",
        title: "Quotation Converted to Invoice",
        message: `Invoice ${created.invoiceNumber} created from Quotation ${quotation.quotationNumber}.`,
        icon: "description",
      });
    };
    const fail = () => {
      setInvoices((prev) => prev.filter((inv) => inv.id !== tempId));
      addNotification({
        type: "error",
        title: "Could Not Convert Quotation",
        message: "The quotation could not be converted. No invoice was created.",
        icon: "error",
      });
    };
    setInvoices((prev) => [preview, ...prev]);
    if (businessId && activeFyId) {
      const payload = invoiceToBackendInput(preview, {
        financialYearId: activeFyId,
        prefix: companyProfile.invoicePrefix || "INV",
        company: companyProfile,
      });
      payload.sourceDocument = { type: "quotation", id: quotation.id };
      void (async () => {
        try {
          const { invoice } = await invoicesApi.create(businessId, payload);
          persist(fromBackendInvoice(invoice));
        } catch {
          fail();
        }
      })();
    } else {
      fail();
    }
  };

  // ------------------------------------------------------------------
  // ESTIMATES
  // ------------------------------------------------------------------
  const addEstimate = (estimateData: Omit<Estimate, "id" | "createdAt">) => {
    const tempId = `est-${Date.now()}`;
    const optimistic: Estimate = {
      ...estimateData,
      id: tempId,
      createdAt: new Date().toISOString(),
    };
    setEstimates((prev) => [optimistic, ...prev]);
    if (businessId && activeFyId) {
      void (async () => {
        try {
          const { estimate: created } = await estimatesApi.create(
            businessId,
            estimateToBackendInput(optimistic, {
              financialYearId: activeFyId,
              prefix: "EST",
              company: companyProfile,
            }),
          );
          if (created?.id) {
            setEstimates((prev) =>
              prev.map((e) =>
                e.id === tempId ? fromBackendEstimate(created) : e,
              ),
            );
          }
        } catch {
          setEstimates((prev) => prev.filter((e) => e.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Estimate",
            message:
              "The estimate could not be saved to the server. Your estimate was not saved.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Estimate Created",
      message: `Estimate ${optimistic.estimateNumber} prepared for ${optimistic.customerName}.`,
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

  // Explicit Estimate -> Quotation conversion. Creates a NEW quotation with its
  // own QT number; the estimate stays unchanged. The backend mints the number
  // and records the estimate's conversion reference (sourceEstimateId).
  const convertEstimateToQuotation = (id: string) => {
    const estimate = estimates.find((e) => e.id === id);
    if (!estimate || estimate.convertedQuotationId) return;
    const tempId = makeId("quot");
    const items: InvoiceItem[] = estimate.items.map((it) => ({ ...it }));
    const preview: Quotation = {
      id: tempId,
      quotationNumber: "",
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
    const persist = (created: Quotation) => {
      setQuotations((prev) => prev.map((q) => (q.id === tempId ? created : q)));
      setEstimates((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "Accepted",
                convertedQuotationId: created.id,
                convertedQuotationNumber: created.quotationNumber,
                convertedAt: nowIso(),
              }
            : e
        )
      );
      addNotification({
        type: "success",
        title: "Estimate Converted to Quotation",
        message: `Quotation ${created.quotationNumber} created from Estimate ${estimate.estimateNumber}.`,
        icon: "request_quote",
      });
    };
    const fail = () => {
      setQuotations((prev) => prev.filter((q) => q.id !== tempId));
      addNotification({
        type: "error",
        title: "Could Not Convert Estimate",
        message: "The estimate could not be converted. No quotation was created.",
        icon: "error",
      });
    };
    setQuotations((prev) => [preview, ...prev]);
    if (businessId && activeFyId) {
      const payload = quotationToBackendInput(preview, {
        financialYearId: activeFyId,
        prefix: "QT",
        company: companyProfile,
      });
      payload.sourceEstimateId = estimate.id;
      void (async () => {
        try {
          const { quotation } = await quotationsApi.create(businessId, payload);
          persist(fromBackendQuotation(quotation));
        } catch {
          fail();
        }
      })();
    } else {
      fail();
    }
  };

  // Explicit Estimate -> Invoice conversion. Creates a NEW invoice with its
  // own INV number; the estimate stays unchanged. The backend mints the number
  // and marks the estimate Accepted + converted (sourceDocument) atomically.
  const convertEstimateToInvoice = (id: string) => {
    const estimate = estimates.find((e) => e.id === id);
    if (!estimate || estimate.convertedInvoiceId) return;
    const used = countCurrentPeriodInvoices(invoices, subscription);
    const gate = checkEntitlement(activePlan, "invoices", used);
    if (!gate.allowed) {
      notifyEntitlementBlocked("invoices", gate);
      return;
    }
    const tempId = makeId("inv");
    const invoiceItems: InvoiceItem[] = estimate.items.map((it) => ({ ...it }));
    const customer = customers.find((c) => c.id === estimate.customerId);
    const pos = placeOfSupplyFromState(customer?.billingAddress?.state || "");
    const taxType = resolveTaxType(sellerStateCode(companyProfile.state), pos.placeOfSupplyCode);
    const split = splitTaxType(estimate.totalTax || 0, taxType);
    const preview: Invoice = {
      id: tempId,
      invoiceNumber: "",
      customerId: estimate.customerId,
      customerName: estimate.customerName,
      customerGstin: estimate.customerGstin,
      customerAddress: estimate.customerAddress,
      customerPhone: estimate.customerPhone,
      date: todayIso(),
      dueDate: plusDaysIso(15),
      placeOfSupply: pos.placeOfSupply,
      placeOfSupplyCode: pos.placeOfSupplyCode,
      items: invoiceItems,
      subtotal: estimate.subtotal,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      totalTax: estimate.totalTax,
      grandTotal: estimate.grandTotal,
      status: "Pending",
      pricingMode: estimate.pricingMode || "inclusive",
      notes: estimate.notes,
    };
    const persist = (created: Invoice) => {
      setInvoices((prev) => prev.map((inv) => (inv.id === tempId ? created : inv)));
      setEstimates((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "Accepted",
                convertedInvoiceId: created.id,
                convertedInvoiceNumber: created.invoiceNumber,
                convertedAt: nowIso(),
              }
            : e
        )
      );
      addNotification({
        type: "success",
        title: "Estimate Converted to Invoice",
        message: `Invoice ${created.invoiceNumber} created from Estimate ${estimate.estimateNumber}.`,
        icon: "description",
      });
    };
    const fail = () => {
      setInvoices((prev) => prev.filter((inv) => inv.id !== tempId));
      addNotification({
        type: "error",
        title: "Could Not Convert Estimate",
        message: "The estimate could not be converted. No invoice was created.",
        icon: "error",
      });
    };
    setInvoices((prev) => [preview, ...prev]);
    if (businessId && activeFyId) {
      const payload = invoiceToBackendInput(preview, {
        financialYearId: activeFyId,
        prefix: companyProfile.invoicePrefix || "INV",
        company: companyProfile,
      });
      payload.sourceDocument = { type: "estimate", id: estimate.id };
      void (async () => {
        try {
          const { invoice } = await invoicesApi.create(businessId, payload);
          persist(fromBackendInvoice(invoice));
        } catch {
          fail();
        }
      })();
    } else {
      fail();
    }
  };

  // ------------------------------------------------------------------
  // PURCHASE ORDERS
  // ------------------------------------------------------------------
  const addPurchaseOrder = (poData: Omit<PurchaseOrder, "id" | "createdAt">) => {
    const tempId = `po-${Date.now()}`;
    const optimistic: PurchaseOrder = {
      ...poData,
      id: tempId,
      createdAt: new Date().toISOString(),
    };
    setPurchaseOrders((prev) => [optimistic, ...prev]);
    if (businessId && activeFyId) {
      void (async () => {
        try {
          const { purchaseOrder: created } = await purchaseOrdersApi.create(
            businessId,
            poToBackendInput(optimistic, {
              financialYearId: activeFyId,
              prefix: "PO",
              company: companyProfile,
            }),
          );
          if (created?.id) {
            setPurchaseOrders((prev) =>
              prev.map((p) =>
                p.id === tempId ? fromBackendPurchaseOrder(created) : p,
              ),
            );
          }
        } catch {
          setPurchaseOrders((prev) => prev.filter((p) => p.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Purchase Order",
            message:
              "The purchase order could not be saved to the server. No purchase order was created.",
            icon: "error",
          });
        }
      })();
    }
    addNotification({
      type: "success",
      title: "Purchase Order Created",
      message: `Purchase Order ${optimistic.poNumber} issued to ${optimistic.vendor.name}.`,
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
        const target = item as Customer;
        const insertRaw = () => setCustomers((prev) => [target, ...prev]);
        if (businessId) {
          void (async () => {
            try {
              const { customer: created } = await customersApi.create(
                businessId,
                customerToBackendInput(target),
              );
              if (created?.id) setCustomers((prev) => [created, ...prev]);
              else insertRaw();
            } catch {
              const gate = checkEntitlement(activePlan, "customers", customers.length);
              if (gate.allowed) insertRaw();
            }
          })();
        } else {
          insertRaw();
        }
      } else if (kind === "product") {
        const target = item as Product;
        const insertRaw = () => setProducts((prev) => [target, ...prev]);
        if (businessId) {
          void (async () => {
            try {
              const { product: created } = await productsApi.create(businessId, target);
              if (created?.id) setProducts((prev) => [created, ...prev]);
              else insertRaw();
            } catch {
              insertRaw();
            }
          })();
        } else {
          insertRaw();
        }
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
      if (businessId) {
        const rolledFy = res.years.find((y) => y.id === res.activeId);
        if (rolledFy && (backendFyIds === null || !backendFyIds.includes(rolledFy.id))) {
          syncFy(businessId, rolledFy);
        }
      }
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
      if (businessId && res.target) {
        const rolledFy = res.years.find((y) => y.id === res.activeId);
        if (rolledFy && (backendFyIds === null || !backendFyIds.includes(rolledFy.id))) {
          syncFy(businessId, rolledFy);
        }
      }
      addNotification({
        type: "info",
        title: "Financial Year Rolled Over",
        message: `New financial year ${res.target?.name || ""} is now active${from ? ` (from ${from})` : ""}. Documents will use the new year's numbering.`,
        icon: "event",
      });
    } else if (res.created) {
      setFinancialYears(res.years);
      if (!activeFinancialYearId) setActiveFinancialYearId(res.activeId);
      if (businessId && res.activeId) {
        const createdFy = res.years.find((y) => y.id === res.activeId);
        if (createdFy && (backendFyIds === null || !backendFyIds.includes(createdFy.id))) {
          syncFy(businessId, createdFy);
        }
      }
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

  // Domain 3: customers are backend-authoritative. On a business scope change
  // the authoritative list is fetched; the response replaces the local cache.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    customersApi
      .list(businessId)
      .then((data) => {
        if (active) setCustomers(data.customers ?? []);
      })
      .catch(() => {
        // Backend unreachable: the previous local cache remains usable; the
        // next write surfaces the API error as a notification.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 4: products are backend-authoritative. On a business scope change
  // the authoritative list is fetched; the response replaces the local cache.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    productsApi
      .list(businessId)
      .then((data) => {
        if (active) setProducts(data.products ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 6: invoices are backend-authoritative on a business scope change.
  // The authoritative list (totals + numbering minted server-side) replaces the
  // local cache when the backend has rows; an empty backend (fresh account)
  // leaves the local demo invoices in place so no data is ever wiped silently.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    invoicesApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.invoices) ? data.invoices : [];
        if (rows.length > 0) {
          setInvoices(rows.map(fromBackendInvoice));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 7: quotations are backend-authoritative on a business scope change.
  // The authoritative list (server-minted numbers, recomputed totals) replaces
  // the local cache when the backend has rows.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    quotationsApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.quotations) ? data.quotations : [];
        if (rows.length > 0) {
          setQuotations(rows.map(fromBackendQuotation));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 8: estimates are backend-authoritative on a business scope change.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    estimatesApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.estimates) ? data.estimates : [];
        if (rows.length > 0) {
          setEstimates(rows.map(fromBackendEstimate));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 9: purchase orders are backend-authoritative on a business scope change.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    purchaseOrdersApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [];
        if (rows.length > 0) {
          setPurchaseOrders(rows.map(fromBackendPurchaseOrder));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 10: expenses are backend-authoritative on a business scope change.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    expensesApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.expenses) ? data.expenses : [];
        if (rows.length > 0) {
          setExpenses(rows.map(fromBackendExpense));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 11: vehicles are backend-authoritative on a business scope change.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    vehiclesApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.vehicles) ? data.vehicles : [];
        if (rows.length > 0) {
          setVehicles(rows.map(fromBackendVehicle));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 12: the team roster is backend-authoritative on a business scope change.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    teamApi
      .list(businessId)
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.members) ? data.members : [];
        if (rows.length > 0) {
          setTeamMembers(rows.map(fromBackendMember));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  // Domain 13: the notification inbox is backend-authoritative once the caller
  // has a business scope. Ephemeral success/error toasts still render locally.
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    notificationsApi
      .list({ businessId })
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data.notifications) ? data.notifications : [];
        if (rows.length > 0) {
          setNotifications(rows.map(fromBackendNotification));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const addCustomer = (customer: Omit<Customer, "id">) => {
    const gate = checkEntitlement(activePlan, "customers", customers.length);
    if (!gate.allowed) {
      notifyEntitlementBlocked("customers", gate);
      return false;
    }
    const tempId = `cust-${Date.now()}`;
    const optimistic: Customer = { ...customer, id: tempId };
    setCustomers((prev) => [...prev, optimistic]);
    addNotification({
      type: "success",
      title: "Customer Added",
      message: `${optimistic.name} added to customer directory.`,
      icon: "group",
    });
    if (businessId) {
      void (async () => {
        try {
          const { customer: created } = await customersApi.create(
            businessId,
            customerToBackendInput(customer),
          );
          if (created?.id) {
            setCustomers((prev) => prev.map((c) => (c.id === tempId ? created : c)));
          }
        } catch {
          setCustomers((prev) => prev.filter((c) => c.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Customer",
            message:
              "The customer could not be saved to the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
    return true;
  };

  const updateCustomer = (customer: Customer) => {
    if (businessId) {
      void (async () => {
        try {
          const { customer: updated } = await customersApi.update(
            businessId,
            customer.id,
            customerToBackendInput(customer),
          );
          if (updated?.id) setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Update Customer",
            message:
              "The customer change could not be saved to the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? customer : c)));
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
    if (businessId) {
      void (async () => {
        try {
          await customersApi.remove(businessId, id);
        } catch {
          setCustomers((prev) => {
            if (target && !prev.some((c) => c.id === id)) return [target, ...prev];
            return prev;
          });
          addNotification({
            type: "error",
            title: "Could Not Remove Customer",
            message:
              "The customer could not be removed from the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
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
    const tempId = `prod-${Date.now()}`;
    const optimistic: Product = { ...product, id: tempId };
    setProducts((prev) => [...prev, optimistic]);
    addNotification({
      type: "success",
      title: "Product Added",
      message: `${optimistic.name} added to catalog.`,
      icon: "inventory_2",
    });
    if (businessId) {
      void (async () => {
        try {
          const { product: created } = await productsApi.create(businessId, product);
          if (created?.id) {
            setProducts((prev) => prev.map((p) => (p.id === tempId ? created : p)));
          }
        } catch {
          setProducts((prev) => prev.filter((p) => p.id !== tempId));
          addNotification({
            type: "error",
            title: "Could Not Save Product",
            message:
              "The product could not be saved to the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
    return true;
  };

  const updateProduct = (product: Product) => {
    if (businessId) {
      void (async () => {
        try {
          const { product: updated } = await productsApi.update(businessId, product.id, product);
          if (updated?.id) setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } catch {
          addNotification({
            type: "error",
            title: "Could Not Update Product",
            message:
              "The product change could not be saved to the server. Reload the app to revert.",
            icon: "error",
          });
        }
      })();
    }
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
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
    if (businessId) {
      void (async () => {
        try {
          await productsApi.remove(businessId, id);
        } catch {
          setProducts((prev) => {
            if (target && !prev.some((p) => p.id === id)) return [target, ...prev];
            return prev;
          });
          addNotification({
            type: "error",
            title: "Could Not Remove Product",
            message:
              "The product could not be removed from the server. Your change was not saved.",
            icon: "error",
          });
        }
      })();
    }
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

  // Single-reliable usage snapshot for every entitlement resource, built once
  // and reused by the usage gauges, canCreateResource, and checkEntitlementFor.
  const resourceUsage: ResourceUsage = getUsage({
    customers: customers.length,
    products: products.length,
    // Only ADDITIONAL (non-owner) members count as paid team seats. The owner
    // is not a seat, so the usage gauge reflects how many extra seats are used
    // against the plan's teamMember ceiling instead of counting the owner.
    teamMembers: additionalTeamSeatsUsed(teamMembers),
    invoicesInPeriod: countCurrentPeriodInvoices(invoices, subscription),
    directoryListings:
      businessId && getMyDirectoryListingCache(businessId) ? 1 : 0,
  });

  const value: AppContextType = {
    activeBusinessId: businessId,
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
    markNotificationRead,
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
    documentSequenceFor,
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
    plans: SUBSCRIPTION_PLANS,
    activePlan,
    subscriptionStatus,
    retrySubscription,
    currentUsage: resourceUsage,
    canCreateResource: (kind: LimitKind) =>
      canCreate(activePlan, kind, usageForKind(resourceUsage, kind)),
    checkEntitlementFor: (kind: LimitKind) =>
      checkEntitlement(activePlan, kind, usageForKind(resourceUsage, kind)),
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