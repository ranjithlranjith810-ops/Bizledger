import { NavSection, OnboardingState } from "@/types";

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
  {
    title: "Support",
    items: [
      { label: "Help & Guides", href: "/help", icon: "help" },
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
  help: "/help",
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

// Routes the app is allowed to RESUME into on entry at `/` (post-login routing
// and app reopen), derived from the stored `lastRoute`.
//
// `lastRoute` is a single "return the user to their last working surface" slot
// persisted in localStorage, and it outlives the session. Every route that
// passes `isValidAppRoute` used to be written to it, which included `/help`:
// Help is reference/learning content, not a working surface. The consequence was
// that a single visit to Help permanently hijacked app entry — the stored value
// survived sign-out/sign-in and app restarts, so every later entry at `/` was
// redirected back to Help and the user could not get away from it.
//
// Help is still a first-class app route (reachable, guarded, and its own tab
// preserved across a refresh, because a refresh never re-enters `/`). It is only
// excluded from being a RESUME TARGET, so entering the app normally lands on the
// user's real work surface, falling back to the dashboard.
const NON_RESUMABLE_ROUTES: ReadonlySet<string> = new Set([ROUTES.help]);

export function isResumableAppRoute(path: string): boolean {
  if (NON_RESUMABLE_ROUTES.has(path)) return false;
  const baseRoutes = Object.values(ROUTES);
  if (baseRoutes.some((r) => path === r || path.startsWith(r + "/"))) {
    return true;
  }
  return /^\/(invoices|vehicles|expenses|team)\//.test(path);
}

// Home (`/`) routing decision, kept pure so the onboarding/guest routing paths
// are unit-testable without a browser.
//
// - `exitedToLanding` is the explicit "Home" signal set by the onboarding
//   wizard: it lets an authenticated user with an incomplete wizard view the
//   public landing page. It is consumed once on the home page and never
//   disables the onboarding guard for other entry points (signup/login
//   redirects, direct visits, refreshes).
// - An unauthenticated visitor always sees the landing page.
// - An incomplete account is sent to the pending wizard step (the server has
//   not confirmed a business for it yet).
// - A completed account is sent to its last app route, else the dashboard.
export function resolveHomeRoute(input: {
  isAuthenticated: boolean;
  onboarding: OnboardingState;
  lastRoute: string | null;
  exitedToLanding: boolean;
}): { redirectTo: string | null; showLanding: boolean } {
  if (input.exitedToLanding) {
    return { redirectTo: null, showLanding: true };
  }
  if (!input.isAuthenticated) {
    return { redirectTo: null, showLanding: true };
  }
  if (!input.onboarding.completed) {
    return {
      redirectTo: onboardingRouteForStep(input.onboarding.currentStep),
      showLanding: false,
    };
  }
  const last = input.lastRoute;
  // `isResumableAppRoute` (not a bare "is it an app route" check) so a Help
  // value ALREADY sitting in localStorage from before this fix can no longer
  // hijack entry. The persisted value outlives the session, so the read site has
  // to be guarded as well as the write site — otherwise the bug would only be
  // fixed for users who never visit Help again, and every existing account
  // would stay pinned to Help.
  if (last && last !== "/" && last !== "/login" && last !== "/signup" && isResumableAppRoute(last)) {
    return { redirectTo: last, showLanding: false };
  }
  return { redirectTo: "/dashboard", showLanding: false };
}

// Resolve the initial onboarding state for an authenticated account.
//
// The onboarding wizard is server-backed: finishing it creates the backend
// business tenant via POST /api/businesses. The Providers scope resolver runs
// GET /api/businesses BEFORE AppProvider mounts, so a non-null resolved
// businessId is the single deterministic signal that this account already
// completed onboarding. Deriving from it (instead of localStorage, which is
// retired) restores completion after full page loads, refreshes, or native
// back navigation — the root cause of payment-flow users being bounced to
// /onboarding/business. An anon or brand-new account has no business yet and
// must run the wizard.
export function resolveInitialOnboardingState(args: {
  activeAccountId: string | null;
  businessId: string | null | undefined;
}): OnboardingState {
  if (args.activeAccountId && args.businessId) {
    return { completed: true, currentStep: 6 };
  }
  return { completed: false, currentStep: 0 };
}