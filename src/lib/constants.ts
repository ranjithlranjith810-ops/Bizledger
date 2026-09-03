import { NavSection } from "@/types";

// Central support e-mail used by the in-app feedback flow. Reachable via a
// mailto: link prefilled with a "BizLedger Feedback" subject.
export const SUPPORT_EMAIL = "support@bizledger.io";

// Product categories offered when creating/editing a product. The last option
// ("Other") requires the user to specify a custom category name.
export const PRODUCT_CATEGORIES = [
  "Pipes & Tubes",
  "Structural Steel",
  "Sheet & Coil",
  "Fasteners",
  "Bearings",
  "Consumables",
  "Electrical",
  "Plumbing",
  "Packaging",
  "Tools & Hardware",
  "Other",
] as const;

export const navigationSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Customers", href: "/customers", icon: "group" },
      { label: "Products", href: "/products", icon: "inventory_2" },
      { label: "Invoices", href: "/invoices", icon: "description" },
      { label: "Quotations", href: "/quotations", icon: "request_quote" },
      { label: "Estimates", href: "/estimates", icon: "insights" },
      { label: "Purchase Orders", href: "/purchase-orders", icon: "local_shipping" },
      { label: "Expenses", href: "/expenses", icon: "receipt_long" },
      { label: "Vehicles & Fleet", href: "/vehicles", icon: "local_shipping" },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Team Members", href: "/team", icon: "group" },
      { label: "Reports & Analytics", href: "/reports", icon: "bar_chart" },
    ],
  },
  {
    title: "Directory",
    items: [
      { label: "Business Directory", href: "/directory", icon: "storefront" },
    ],
  },
  {
    title: "Settings & Admin",
    items: [
      { label: "Company Profile", href: "/settings", icon: "settings" },
      { label: "Financial Year", href: "/settings/financial-years", icon: "calendar_month" },
      { label: "Subscription & Billing", href: "/settings/billing", icon: "card_membership" },
      { label: "Pricing Plans", href: "/pricing", icon: "sell" },
    ],
  },
];

export const ROUTES = {
  dashboard: "/dashboard",
  customers: "/customers",
  products: "/products",
  invoices: "/invoices",
  quotations: "/quotations",
  estimates: "/estimates",
  purchaseOrders: "/purchase-orders",
  expenses: "/expenses",
  vehicles: "/vehicles",
  team: "/team",
  reports: "/reports",
  directory: "/directory",
  settings: "/settings",
  financialYears: "/settings/financial-years",
  billing: "/settings/billing",
  billingHistory: "/settings/billing/history",
  pricing: "/pricing",
  onboarding: "/onboarding",
  onboardingBusiness: "/onboarding/business",
  onboardingTax: "/onboarding/tax",
  onboardingAddress: "/onboarding/address",
  onboardingInvoice: "/onboarding/invoice",
  onboardingFinancialYear: "/onboarding/financial-year",
  onboardingReview: "/onboarding/review",
} as const;

// Ordered wizard steps: index 0 is the "business details" step.
export const ONBOARDING_STEPS: { step: number; label: string; href: string }[] = [
  { step: 1, label: "Business Details", href: "/onboarding/business" },
  { step: 2, label: "Tax & GST", href: "/onboarding/tax" },
  { step: 3, label: "Address", href: "/onboarding/address" },
  { step: 4, label: "Invoice Setup", href: "/onboarding/invoice" },
  { step: 5, label: "Financial Year", href: "/onboarding/financial-year" },
  { step: 6, label: "Review & Finish", href: "/onboarding/review" },
];

// Map a stored onboarding currentStep value to its route (clamped 1..6).
export function onboardingRouteForStep(step: number): string {
  const clamped = Math.min(6, Math.max(1, step || 1));
  const found = ONBOARDING_STEPS.find((s) => s.step === clamped);
  return found ? found.href : "/onboarding/business";
}