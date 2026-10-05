import type { IconName } from "@/components/ui/Icon";

export type CustomerType = 'business' | 'individual';

export type GSTRegistrationStatus =
  | 'registered'
  | 'composite'
  | 'unregistered'
  | 'consumer';

// A financial year / accounting period for a business account.
export interface FinancialYearSettings {
  id: string;
  name: string; // e.g. "Financial Year 2026-27"
  startDate: string; // ISO date
  endDate: string; // ISO date
}

// Per-fiscal-year document numbering sequences (invoice/quotation/estimate/PO).
// Each year keeps an independent counter so historical numbers never change
// and a new year always starts at 1.
export interface PerFySequences {
  invoice: number;
  quotation: number;
  estimate: number;
  purchaseOrder: number;
}

export type SequenceKind = keyof PerFySequences;

// Onboarding wizard progress (per account, frontend-only).
export interface OnboardingState {
  completed: boolean;
  currentStep: number; // 0 = not started, 1..6 = step index
}

export type CustomerStatus = 'Active' | 'Pending' | 'Overdue' | 'Inactive';

export type InvoiceStatus = 'Paid' | 'Pending' | 'Overdue' | 'Draft' | 'Cancelled';

export type ExpenseStatus = 'Paid' | 'Pending' | 'Approved' | 'Rejected';

export type ExpenseCategory =
  | 'Raw Material'
  | 'Utilities'
  | 'Fuel'
  | 'Maintenance'
  | 'Office Supplies'
  | 'Labour & Wages'
  | 'Marketing'
  | 'Rent'
  | 'Travel'
  | 'Vehicle'
  | 'Other';

export type VehicleType = 'Mini Truck' | 'Pickup' | 'Truck' | 'Van' | 'Car' | 'Two-Wheeler';

export type VehicleStatus = 'Active' | 'Under Maintenance' | 'Inactive';

export type VehicleExpenseCategory = 'Fuel' | 'Service & Maintenance' | 'Fastag / Toll' | 'Tyre' | 'Repairs' | 'Insurance' | 'Others' | 'Other';

export type TeamRole = 'Owner' | 'Manager' | 'Accountant' | 'Staff';

export type TeamStatus = 'Active' | 'Pending Invitation' | 'Inactive';

// Plan ids are opaque, platform-assigned identifiers. The shipped catalog uses
// 'base' | 'business' | 'enterprise', but admin-created plans carry arbitrary
// server-generated ids (the customer UI must never reject them at the type
// level â€” the DB-driven catalog is the source of truth).
export type SubscriptionPlanId = string;

// Resource kinds gated by subscription plan limits (entitlement engine).
// Estimates / quotations / purchase orders meter against the SAME numeric
// ceiling as invoices per plan, but each kind tracks its OWN separate usage
// counter (creating an estimate never consumes an invoice slot and vice-versa).
export type EntitlementLimitKind =
  | 'invoices'
  | 'estimates'
  | 'quotations'
  | 'purchaseOrders'
  | 'customers'
  | 'teamMembers'
  | 'products'
  | 'directoryListing';

export interface EntitlementCheckResult {
  allowed: boolean;
  kind: EntitlementLimitKind;
  limit: number | 'Unlimited';
  used: number;
  remaining: number | 'Unlimited';
  reason: 'ok' | 'no-active-plan' | 'limit';
}

export interface Address {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface PrimaryContact {
  name: string;
  designation?: string;
  mobile: string;
  email?: string;
}

export interface Customer {
  id: string;
  code: string;
  type: CustomerType;
  name: string;
  avatarInitials: string;
  businessType?: string;
  gstStatus: GSTRegistrationStatus;
  gstin?: string;
  panNumber?: string;
  website?: string;
  primaryContact: PrimaryContact;
  billingAddress: Address;
  shippingAddress: Address;
  sameAsBilling?: boolean;
  stateCode?: string; // numeric GST state code derived from billingAddress.state
  creditLimit: number;
  paymentTerms: string;
  notes?: string;
  status: CustomerStatus;
  outstandingBalance: number;
  totalSales: number;
  totalInvoices: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: string;
  lastPaymentMethod?: string;
  createdDate: string;
  sinceDate?: string;
}

// Pricing mode for a tax document:
// - "inclusive" (DEFAULT / canonical): the entered unit price already includes
//   GST; the line total reconciles exactly to qty x rate and GST is shown split.
// - "exclusive": the entered unit price is the taxable base; GST is added on
//   top, so the total = taxable + GST.
// Older documents without the field are treated as "inclusive".
export type PricingMode = "inclusive" | "exclusive";

export interface InvoiceItem {
  id: string;
  productId?: string;
  description: string;
  hsnSac?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  taxAmount: number;
  totalAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  date: string;
  dueDate: string;
  placeOfSupply?: string;
  placeOfSupplyCode?: string;
  // Optional vehicle-dispatch block shown on the printable invoice.
  vehicle?: {
    vehicleNumber?: string;
    driverName?: string;
    status?: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  status: InvoiceStatus;
  pricingMode: PricingMode;
  notes?: string;
  // Optional e-way bill reference. This is a FIELD for later capture â€” the app
  // never fabricates an e-way bill; it only records one once supplied.
  ewayBillNumber?: string;
  ewayBillDate?: string;
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired';

export type EstimateStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired';

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Sent'
  | 'Accepted'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

// Reuses the same per-line model as an invoice (GST-inclusive unit price with
// stored taxable/tax/total split) so the single shared GST calculator in
// src/lib/invoice.ts drives every document type.
export type SalesDocumentItem = InvoiceItem;

// ---------------------------------------------------------------------
// QUOTATION â€” fixed quoted price offered by the seller to a buyer.
// ---------------------------------------------------------------------
export interface Quotation {
  id: string;
  quotationNumber: string; // QT/26-27/001
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  date: string; // ISO date
  validUntil: string; // ISO date
  items: SalesDocumentItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  status: QuotationStatus;
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  // Conversion: an explicit "Convert to Invoice" creates a NEW invoice and
  // stores the relationship here. The quotation itself is never modified
  // beyond recording the resulting reference.
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  convertedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------
// ESTIMATE â€” approximate expected cost (scope not fully known). NOT a
// quotation and never presented as a fixed price or final invoice.
// ---------------------------------------------------------------------
export interface Estimate {
  id: string;
  estimateNumber: string; // EST/26-27/001
  customerId: string;
  customerName: string;
  customerGstin?: string;
  customerAddress?: string;
  customerPhone?: string;
  date: string; // ISO date
  validUntil?: string; // optional ISO date
  scope?: string; // scope / description
  items: SalesDocumentItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  status: EstimateStatus;
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  // Explicit conversions: estimate -> new quotation and/or new invoice.
  convertedQuotationId?: string;
  convertedQuotationNumber?: string;
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  convertedAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------
// PURCHASE ORDER â€” official order issued by the buyer to a supplier.
// Direction is buyer -> seller (opposite of a sales quotation).
// ---------------------------------------------------------------------
export interface PurchaseOrderVendor {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string; // joined multi-line address
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // PO/26-27/001
  vendor: PurchaseOrderVendor;
  date: string; // ISO date
  deliveryDate?: string; // ISO date
  deliveryAddress?: string;
  deliveryMode?: string;
  items: SalesDocumentItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  status: PurchaseOrderStatus;
  pricingMode: PricingMode;
  notes?: string;
  terms?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  paymentMethod: string;
  paidFromAccount: string;
  referenceNumber?: string;
  vendor?: string;
  expenseType: 'Direct' | 'Indirect';
  status: ExpenseStatus;
  notes?: string;
  receiptUrl?: string;
  receiptName?: string;
  receiptSize?: string;
  vehicleId?: string;
  vehicleRegistration?: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  makeModel: string;
  vehicleType: VehicleType;
  fuelType: 'Diesel' | 'Petrol' | 'CNG' | 'Electric';
  manufacturingYear: number;
  chassisNumber: string;
  engineNumber: string;
  driverName: string;
  driverPhone: string;
  driverLicense: string;
  driverLicenseExpiry: string;
  insurancePolicyNumber: string;
  insuranceExpiry: string;
  fcExpiry: string;
  pucExpiry: string;
  currentOdometer: number;
  status: VehicleStatus;
  totalExpenses: number;
  fuelExpenses: number;
  maintenanceExpenses: number;
  tollExpenses: number;
  otherExpenses: number;
  assignedRoute: string;
  lastServiceDate: string;
}

export interface VehicleExpense {
  id: string;
  vehicleId: string;
  vehicleRegistration: string;
  date: string;
  category: VehicleExpenseCategory;
  amount: number;
  odometerReading?: number;
  fuelLitres?: number;
  fuelRate?: number;
  vendor?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ModulePermissions {
  invoices: { view: boolean; create: boolean; edit: boolean; delete: boolean };
  expenses: { view: boolean; create: boolean; approve: boolean; delete: boolean };
  vehicles: { view: boolean; manage: boolean; logExpenses: boolean };
  customers: { view: boolean; manage: boolean };
  reports: { view: boolean; export: boolean };
  settings: { view: boolean; edit: boolean };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  avatar?: string;
  role: TeamRole;
  status: TeamStatus;
  permissions: ModulePermissions;
  lastActive: string;
  joinedDate: string;
}

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  price: number;
  period: 'month' | 'year';
  description: string;
  popular?: boolean;
  features: string[];
  // Whether the Business Network (public directory) is included for this plan.
  // Base = false (feature-gated to paid plans); Business/Enterprise = true.
  // The numeric ceiling for published listings lives in limits.directoryListings
  // (0 => not included; >0 or "Unlimited" => included). The entitlement engine
  // reads limits.directoryListings as the single source of truth for access.
  businessNetworkIncluded: boolean;
  limits: {
    customers: number | 'Unlimited';
    teamMembers: number | 'Unlimited';
    products: number | 'Unlimited';
    invoicesPerMonth: number | 'Unlimited';
    // The three document kinds below share the SAME ceiling as the invoice
    // quota per plan (the pricing policy keeps all four document budgets in
    // lockstep), but usage is metered SEPARATELY per kind — each has its own
    // monthly counter. (See entitlements-server countUsage / PricingView.)
    estimatesPerMonth: number | 'Unlimited';
    quotationsPerMonth: number | 'Unlimited';
    purchaseOrdersPerMonth: number | 'Unlimited';
    // Directory listing ceiling. 0 = Business Network not included (feature
    // gated for paid plans only). Any positive value (or "Unlimited") grants
    // access with that many published listings.
    directoryListings: number | 'Unlimited';
  };
}

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';
export type PaymentOutcome = 'success' | 'failed' | 'cancelled';
// Client mirror of the server-effective subscription lifecycle. 'grace' is an
// effective (not stored) state: the paid period ended but the subscribed plan
// still governs during the 3-calendar-day grace window. The server DTO is
// authoritative; the client never derives this from the browser clock.
export type SubscriptionStatus = 'active' | 'grace' | 'none' | 'suspended';

export interface PaymentRecord {
  id: string;
  date: string; // ISO
  planId: SubscriptionPlanId;
  planName: string;
  billingPeriod: 'month' | 'year';
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  method: PaymentMethod;
  status: PaymentOutcome;
  description: string;
  // Refund request state. This records a user's refund request; it does NOT
  // process or grant a refund on its own. 'none' = no request; 'requested' =
  // user requested a refund within the refund window; grant/deny are applied by
  // the payments/support flow.
  refundStatus?: 'none' | 'requested';
  refundReason?: string;
}

export interface SubscriptionBilling {
  period: 'month' | 'year';
  startedAt: string | null; // ISO
  renewsAt: string | null; // ISO next billing date (paid-period end)
  amount: number; // base amount (pre-GST)
  gstRate: number;
  lastPaidAt?: string | null; // ISO
  // Effective-lifecycle metadata (server-supplied; null/false when not in a
  // grace or expired window). graceEndsAt is the ISO instant FREE begins.
  graceEndsAt?: string | null;
  renewalRequired?: boolean;
}

// SINGLE source of truth for subscription state (persisted per account).
export interface SubscriptionState {
  currentPlanId: SubscriptionPlanId | null;
  status: SubscriptionStatus;
  billing: SubscriptionBilling;
  // Pending checkout selection â€” NOT active until a successful payment.
  pendingPlanId: SubscriptionPlanId | null;
  pendingPeriod: 'month' | 'year';
}

export interface CompanyProfile {
  companyName: string;
  businessType: string;
  ownerName: string;
  mobile: string;
  email: string;
  website: string;
  streetAddress: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  pan: string;
  gstRegistered: GSTRegistrationStatus;
  udyamNo?: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId?: string;
  invoiceTerms: string;
  paymentTerms?: string;
  gstSupportInfo?: string;
  invoicePrefix: string;
  invoiceStartingNumber: number;
  logoUrl?: string;
  digitalSignatureUrl?: string;
}

// Business Directory model. A directory listing is an OPT-IN, publicly
// publishable record scoped to the account (separate from the private
// CompanyProfile). Only the owner can create/edit/unlist it; only explicitly
// published fields are disclosed.
export type DirectoryListingStatus =
  | 'Not Listed'
  | 'Pending Review'
  | 'Published'
  | 'Suspended'
  | 'Rejected';

export type DirectoryBusinessType =
  | 'Manufacturer'
  | 'Dealer'
  | 'Wholesaler'
  | 'Distributor'
  | 'Retailer'
  | 'Supplier';

export type DirectoryGstStatus =
  | 'Not Provided'
  | 'GSTIN Provided' // owner supplied a GSTIN; no third-party verification
  | 'GST Verified';  // reserved for a future backend verification step

export interface DirectoryBusiness {
  id: string;
  accountId: string; // owning account (tenant isolation)
  status: DirectoryListingStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  companyName: string;
  businessType: DirectoryBusinessType;
  categories: string[];
  description: string;
  streetAddress: string;
  city: string;
  state: string; // must reference INDIAN_STATES
  stateCode?: string; // numeric GST state code derived from state name
  pincode: string;
  landmark?: string;
  ownerName: string;
  primaryPhone: string; // published contact (tel: link)
  alternatePhone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  gstStatus: DirectoryGstStatus;
  logoUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  unitPrice: number;
  stockQuantity: number;
  hsnSac: string;
  gstRate: number;
}

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  badge?: string | number;
  activePattern?: RegExp;
}


export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface NotificationItem {
  id: string;
  type: 'payment' | 'warning' | 'payroll' | 'renewal' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  timeAgo: string;
  read: boolean;
  icon: IconName;
  iconColor?: string;
}

export interface AppNotificationInput {
  type: NotificationItem["type"];
  title: string;
  message: string;
  icon?: IconName;
  iconColor?: string;
}

// NOTE: 'invoice' | 'estimate' | 'quotation' | 'purchaseOrder' were removed
// deliberately. Those four document types are NOT deletable in any status, so
// they must not even be representable as a delete target â€” the server rejects
// the DELETE unconditionally and no UI may offer it. Keeping them in this union
// would leave a compile-time path to a delete affordance that can only fail.
export type DeleteEntityKind =
  | 'product'
  | 'customer'
  | 'expense'
  | 'vehicle'
  | 'team';

export interface DeleteConfirmState {
  kind: DeleteEntityKind;
  id: string;
  name: string;
}

/**
 * Financial-domain hydration lifecycle keys. One status entry per domain list
 * hydrated from the backend so consumers can distinguish loading, successfully
 * empty, successfully populated, and failed (previous data retained) states.
 */
export type DomainHydrationKey =
  | 'customers'
  | 'products'
  | 'invoices'
  | 'quotations'
  | 'estimates'
  | 'purchaseOrders'
  | 'expenses'
  | 'vehicles'
  | 'team'
  | 'notifications';

export type DomainHydrationStatus = 'loading' | 'ready' | 'error';

/** Result of an invoice create: the persisted record, or a distinguished
 * failure (duplicate invoice number -> dedicated dialog; anything else -> the
 * generic failed-toast path). Shared by the context and the create modal. */
export type InvoiceCreateResult =
  | { status: 'created'; invoice: Invoice }
  | { status: 'duplicate' }
  | { status: 'failed' };

export interface AppContextType {
  /** Result of an invoice create: the persisted record, or a distinguished
   * failure (duplicate invoice number -> dedicated dialog; anything else -> the
   * generic failed-toast path). */
  addInvoice: (invoice: Omit<Invoice, 'id'>) => Promise<InvoiceCreateResult>;
  activeBusinessId: string | null;
  activeRoute: string;
  setActiveRoute: (route: string) => void;
  openModal: string | null;
  setOpenModal: (modal: string | null) => void;
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  selectedExpenseId: string | null;
  setSelectedExpenseId: (id: string | null) => void;
  notifications: NotificationItem[];
  addNotification: (notif: AppNotificationInput) => void;
  removeNotification: (id: string) => void;
  isNotificationOpen: boolean;
  setIsNotificationOpen: (open: boolean) => void;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  deleteConfirm: DeleteConfirmState | null;
  setDeleteConfirm: (state: DeleteConfirmState | null) => void;
  confirmDelete: (state: DeleteConfirmState) => void;
  performDelete: (state: DeleteConfirmState) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  companyProfile: CompanyProfile;
  updateCompanyProfile: (profile: Partial<CompanyProfile>) => void;
  financialYears: FinancialYearSettings[];
  activeFinancialYearId: string | null;
  getActiveFinancialYear: () => FinancialYearSettings | undefined;
  addFinancialYear: (fy: Omit<FinancialYearSettings, "id">) => FinancialYearSettings;
  updateFinancialYear: (id: string, patch: Partial<FinancialYearSettings>) => void;
  deleteFinancialYear: (id: string) => void;
  setActiveFinancialYear: (id: string) => void;
  ensureFinancialYearRollover: () => void;
  mintDocumentNumber: (prefix: string, kind: SequenceKind) => string;
  /** Per-FY sequence read (preview only): the current counter value for an
   *  arbitrary financial year + kind. Lets a date-derived number preview stay
   *  consistent with its year so the UI can never visually suggest a
   *  mismatched fiscal year. Never allocates. */
  documentSequenceFor: (fyId: string | null, kind: SequenceKind) => number;
  /** True once `syncServerSequence` has confirmed this (fyId, kind) counter with
   *  the server. A create form must not render a number before this is true:
   *  the only other value available is the localStorage seed, which starts at 1
   *  on a fresh browser and can be arbitrarily wrong. */
  isServerSequenceReady: (fyId: string | null, kind: SequenceKind) => boolean;
  /** Pull the server's authoritative counter for ONE document kind into the
   *  local cache so a create form previews the number the server will actually
   *  allocate. Read-only: it never allocates, and it never blocks the form.
   *  Call it for the FY a create form is previewing (derived from the document
   *  date, which can differ from the active financial year) and for the single
   *  kind that form is about to create. Synthetic FY ids are ignored. */
  syncServerSequence: (fyId: string | null, kind: SequenceKind) => Promise<void>;
  onboarding: OnboardingState;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => Promise<string | null>;
  currentPlanId: SubscriptionPlanId | null;
  subscription: SubscriptionState;
  pendingPlanId: SubscriptionPlanId | null;
  pendingPeriod: 'month' | 'year';
  setPendingPlan: (planId: SubscriptionPlanId | null, period?: 'month' | 'year') => void;
  completePayment: (outcome: PaymentOutcome, method: PaymentMethod) => void;
  requestRefund: (paymentId: string, reason: string) => boolean;
  plans: SubscriptionPlan[];
  activePlan: SubscriptionPlan | null;
  subscriptionStatus: "loading" | "ready" | "error";
  retrySubscription: () => void;
  // DB-driven plan catalog lifecycle (server /api/billing/plans). `plans`
  // falls back to the static catalog on failure; `planCatalogStatus` lets the
  // pricing UI surface loading / offline-fallback honestly instead of silently
  // showing a stale catalog.
  planCatalogStatus: "loading" | "ready" | "error";
  retryPlanCatalog: () => void;
  /** Financial-domain hydration lifecycle. One status per domain so consumers
   *  can distinguish loading vs successfully-empty vs populated vs failed
   *  (previous data retained). */
  domainHydration: Record<DomainHydrationKey, DomainHydrationStatus>;
  /** User-triggered only: re-runs the existing *.list(businessId) calls. */
  retryDomains: () => void;
  currentUsage: {
    invoices: number;
    estimates: number;
    quotations: number;
    purchaseOrders: number;
    customers: number;
    teamMembers: number;
    products: number;
    directoryListings: number;
  };
  canCreateResource: (kind: EntitlementLimitKind) => boolean;
  checkEntitlementFor: (kind: EntitlementLimitKind) => EntitlementCheckResult;
  paymentHistory: PaymentRecord[];
  expenses: Expense[];
  vehicles: Vehicle[];
  vehicleExpenses: VehicleExpense[];
  teamMembers: TeamMember[];
  customers: Customer[];
  products: Product[];
  invoices: Invoice[];
  quotations: Quotation[];
  estimates: Estimate[];
  purchaseOrders: PurchaseOrder[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  updateExpense: (expense: Expense) => void;
  deleteExpense: (id: string) => void;
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'totalExpenses' | 'fuelExpenses' | 'maintenanceExpenses' | 'tollExpenses' | 'otherExpenses'>) => void;
  updateVehicle: (vehicle: Vehicle) => void;
  deleteVehicle: (id: string) => void;
  addVehicleExpense: (expense: Omit<VehicleExpense, 'id'>) => void;
  addTeamMember: (member: Omit<TeamMember, 'id' | 'lastActive' | 'joinedDate'>) => boolean;
  updateTeamMember: (member: TeamMember) => void;
  deleteTeamMember: (id: string) => void;
addCustomer: (customer: Omit<Customer, 'id'>) => boolean;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (id: string) => void;
  addProduct: (product: Omit<Product, 'id'>) => boolean;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  updateInvoice: (invoice: Invoice) => Promise<boolean>;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<boolean>;
  invoiceSequence: number;
  advanceInvoiceSequence: () => number;
  addQuotation: (quotation: Omit<Quotation, 'id' | 'createdAt'>) => Promise<Quotation | null>;
  updateQuotation: (quotation: Quotation) => void;
  updateQuotationStatus: (id: string, status: QuotationStatus) => Promise<boolean>;
  quotationSequence: number;
  advanceQuotationSequence: () => number;
  addEstimate: (estimate: Omit<Estimate, 'id' | 'createdAt'>) => Promise<Estimate | null>;
  updateEstimate: (estimate: Estimate) => void;
  updateEstimateStatus: (id: string, status: EstimateStatus) => Promise<boolean>;
  estimateSequence: number;
  advanceEstimateSequence: () => number;
  addPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'createdAt'>) => Promise<PurchaseOrder | null>;
  updatePurchaseOrder: (po: PurchaseOrder) => void;
  updatePurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) => Promise<boolean>;
  purchaseOrderSequence: number;
  advancePurchaseOrderSequence: () => number;
  convertQuotationToInvoice: (id: string) => void;
  convertEstimateToQuotation: (id: string) => void;
  convertEstimateToInvoice: (id: string) => void;
  /**
   * UI-only: the conversion currently awaiting the server, or null.
   * `id` is the SOURCE document id, so a detail view only shows the busy
   * state for the row it is actually rendering. Raised immediately before the
   * conversion's await and cleared in that request's finally().
   */
  convertingDocument: { id: string; target: "quotation" | "invoice" } | null;
  /**
   * UI-only: the document whose STATUS TRANSITION is currently awaiting the
   * server, or null. `id` is the document being transitioned, so a detail view
   * only disables its own status control. Raised immediately before the
   * transition's await and cleared in that request's finally(). The status is
   * never set locally — it is replaced from the server response on success.
   */
  transitioningDocument: { id: string } | null;
  restoreLastDeleted: () => void;
}

export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  createdAt: string;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string };

export interface AuthContextType {
  account: LocalAccount | null;
  isAuthenticated: boolean;
  authPending: boolean;
  /** True when the initial session fetch failed (network/server). Consumers must
   *  still resolve to a safe state â€” redirect or recoverable error â€” and must
   *  never leave an indefinite loading spinner. */
  authError: boolean;
  lastRoute: string | null;
  createAccount: (input: {
    name: string;
    email: string;
    password: string;
    businessName?: string;
  }) => Promise<AuthResult>;
  login: (input: { email: string; password: string }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  requestPasswordReset: (input: { email: string }) => Promise<AuthResult>;
  resetPassword: (input: {
    token: string;
    newPassword: string;
  }) => Promise<AuthResult>;
  verifyEmail: (input: {
    token: string;
    callbackURL?: string;
  }) => Promise<AuthResult>;
  sendVerificationEmail: (input: { email: string }) => Promise<AuthResult>;
  setLastRoute: (route: string) => void;
}