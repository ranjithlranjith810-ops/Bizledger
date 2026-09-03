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

export type SubscriptionPlanId = 'base' | 'business' | 'enterprise';

// Resource kinds gated by subscription plan limits (entitlement engine).
export type EntitlementLimitKind =
  | 'invoices'
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
  // Optional e-way bill reference. This is a FIELD for later capture — the app
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
// QUOTATION — fixed quoted price offered by the seller to a buyer.
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
// ESTIMATE — approximate expected cost (scope not fully known). NOT a
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
// PURCHASE ORDER — official order issued by the buyer to a supplier.
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
    // Directory listing ceiling. 0 = Business Network not included (feature
    // gated for paid plans only). Any positive value (or "Unlimited") grants
    // access with that many published listings.
    directoryListings: number | 'Unlimited';
  };
}

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet';
export type PaymentOutcome = 'success' | 'failed' | 'cancelled';
export type SubscriptionStatus = 'active' | 'none' | 'suspended';

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
  // Refund request state (frontend demo). This records a user's refund request
  // locally; it does NOT process or grant a refund until a production payment
  // processor exists. 'none' = no request; 'requested' = user requested a
  // refund within the refund window; grant/deny get a backend in the next phase.
  refundStatus?: 'none' | 'requested';
  refundReason?: string;
}

export interface SubscriptionBilling {
  period: 'month' | 'year';
  startedAt: string | null; // ISO
  renewsAt: string | null; // ISO next billing date
  amount: number; // base amount (pre-GST)
  gstRate: number;
  lastPaidAt?: string | null; // ISO
}

// SINGLE source of truth for subscription state (persisted per account).
export interface SubscriptionState {
  currentPlanId: SubscriptionPlanId | null;
  status: SubscriptionStatus;
  billing: SubscriptionBilling;
  // Pending checkout selection — NOT active until a successful payment.
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
  icon: string;
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
  icon: string;
  iconColor?: string;
}

export interface AppNotificationInput {
  type: NotificationItem["type"];
  title: string;
  message: string;
  icon?: string;
  iconColor?: string;
}

export type DeleteEntityKind =
  | 'product'
  | 'customer'
  | 'invoice'
  | 'expense'
  | 'vehicle'
  | 'team'
  | 'quotation'
  | 'estimate'
  | 'purchaseOrder';

export interface DeleteConfirmState {
  kind: DeleteEntityKind;
  id: string;
  name: string;
}

export interface AppContextType {
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
  onboarding: OnboardingState;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => void;
  currentPlanId: SubscriptionPlanId | null;
  subscription: SubscriptionState;
  pendingPlanId: SubscriptionPlanId | null;
  pendingPeriod: 'month' | 'year';
  setPendingPlan: (planId: SubscriptionPlanId | null, period?: 'month' | 'year') => void;
  completePayment: (outcome: PaymentOutcome, method: PaymentMethod) => void;
  requestRefund: (paymentId: string, reason: string) => boolean;
  changePlan: (planId: SubscriptionPlan["id"]) => void;
  plans: SubscriptionPlan[];
  activePlan: SubscriptionPlan | null;
  currentUsage: {
    invoices: number;
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
  addInvoice: (invoice: Omit<Invoice, 'id'>) => boolean;
  updateInvoice: (invoice: Invoice) => void;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => void;
  deleteInvoice: (id: string) => void;
  invoiceSequence: number;
  advanceInvoiceSequence: () => number;
  addQuotation: (quotation: Omit<Quotation, 'id' | 'createdAt'>) => void;
  updateQuotation: (quotation: Quotation) => void;
  updateQuotationStatus: (id: string, status: QuotationStatus) => void;
  deleteQuotation: (id: string) => void;
  quotationSequence: number;
  advanceQuotationSequence: () => number;
  addEstimate: (estimate: Omit<Estimate, 'id' | 'createdAt'>) => void;
  updateEstimate: (estimate: Estimate) => void;
  updateEstimateStatus: (id: string, status: EstimateStatus) => void;
  deleteEstimate: (id: string) => void;
  estimateSequence: number;
  advanceEstimateSequence: () => number;
  addPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'createdAt'>) => void;
  updatePurchaseOrder: (po: PurchaseOrder) => void;
  updatePurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) => void;
  deletePurchaseOrder: (id: string) => void;
  purchaseOrderSequence: number;
  advancePurchaseOrderSequence: () => number;
  convertQuotationToInvoice: (id: string) => void;
  convertEstimateToQuotation: (id: string) => void;
  convertEstimateToInvoice: (id: string) => void;
  restoreLastDeleted: () => void;
  resetBusinessData: () => void;
  resetEntireSetup: () => void;
  loadDemoData: () => void;
}

export interface LocalAccount {
  id: string;
  name: string;
  email: string;
  businessName?: string;
  createdAt: string;
}

export interface AuthContextType {
  account: LocalAccount | null;
  isAuthenticated: boolean;
  lastRoute: string | null;
  createAccount: (input: { name: string; email: string; businessName?: string }) => LocalAccount;
  login: (email: string) => boolean;
  logout: () => void;
  setLastRoute: (route: string) => void;
}