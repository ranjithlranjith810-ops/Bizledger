"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { BizLedgerLoader } from "@/components/ui/BizLedgerLoader";
import { ROUTES, isResumableAppRoute, onboardingRouteForStep } from "@/lib/constants";
import { LEGAL_LINKS } from "@/config/legal";
import { canAccessRoute, OWNER_PERMISSIONS } from "@/lib/permissions";
import { Icon } from "../ui/Icon";

// Public marketing/auth paths plus the standalone legal / policy documents.
// Legal pages are intentionally accessible without logging in or completing an
// onboarding wizard (they are not part of the authenticated dashboard shell).
// /forgot-password and /reset-password/<token> are also public: the reset flow
// is entered from an emailed link by a user who is, by definition, not signed in.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  ...LEGAL_LINKS.map((l) => l.href),
]);

const ONBOARDING_PATHS = new Set([
  "/onboarding",
  "/onboarding/business",
  "/onboarding/tax",
  "/onboarding/address",
  "/onboarding/invoice",
  "/onboarding/financial-year",
  "/onboarding/review",
]);

function isPublicPath(path: string): boolean {
  return (
    PUBLIC_PATHS.has(path) ||
    path === "/reset-password" ||
    path.startsWith("/reset-password/")
  );
}

function isOnboardingPath(path: string): boolean {
  return ONBOARDING_PATHS.has(path) || path.startsWith("/onboarding/");
}

function isValidAppRoute(path: string): boolean {
  const baseRoutes = Object.values(ROUTES).filter((r) => r !== "/dashboard");
  if (baseRoutes.some((r) => path === r || path.startsWith(r + "/"))) {
    return true;
  }
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return true;
  if (/^\/(invoices|vehicles|expenses|team)\//.test(path)) return true;
  return false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, authPending, authError, setLastRoute } = useAuth();
  const { onboarding } = useApp();

  useEffect(() => {
    if (isPublicPath(pathname)) return;
    if (authPending) return;
    if (!isAuthenticated) {
      // No active session (or the initial session fetch failed with no cached
      // user): send the visitor to the dedicated auth entry. /login is a public
      // path, so there is no redirect loop. This resolves the loading state in
      // every outcome — authenticated renders, unauthenticated redirects.
      router.replace("/login");
      return;
    }
    // Role-based route enforcement. In the backend phase this uses the
    // authenticated member's effective permissions; until then the local
    // operator is the Owner, who has full access to every route.
    if (isValidAppRoute(pathname) && !canAccessRoute(OWNER_PERMISSIONS, pathname)) {
      router.replace("/dashboard");
      return;
    }
    // Authenticated users with an incomplete onboarding wizard are directed to
    // the pending step (unless they are already on an onboarding route). Because
    // this only happens after Providers has a server-CONFIRMED no-business
    // state, it is a genuine onboarding gap, not a transient failure. Remember
    // the original route so the wizard can hand the user back to it on finish.
    if (!onboarding.completed && !isOnboardingPath(pathname)) {
      if (isValidAppRoute(pathname)) setLastRoute(pathname);
      router.replace(onboardingRouteForStep(onboarding.currentStep));
      return;
    }
    // A completed account must never stay on (or be sent back into) an
    // onboarding step — a stale /onboarding/* route or direct navigation is
    // redirected to the dashboard. Onboarding is finished; there is nothing to
    // resume.
    if (onboarding.completed && isOnboardingPath(pathname)) {
      router.replace("/dashboard");
      return;
    }
    // Only record routes the app may later RESUME into on entry at `/`. This is
    // still a valid app route while the user is browsing it (a refresh keeps them
    // here, since a refresh never re-enters `/`), but persisting `/help` here is
    // what let a single Help visit pin every later sign-in and app reopen to
    // Help. The read side in `resolveHomeRoute` is guarded as well so already
    // stored values are neutralized too.
    if (isResumableAppRoute(pathname)) {
      setLastRoute(pathname);
    }
  }, [pathname, router, setLastRoute, isAuthenticated, authPending, onboarding.completed, onboarding.currentStep]);

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  // A session check that failed OR never settled (see the AuthContext watchdog)
  // must show a recoverable error instead of an indefinite loading spinner. This
  // is evaluated BEFORE the authPending loader so a hung session fetch resolves
  // to an actionable screen rather than a permanent spinner. The effect above
  // only redirects unauthenticated routes once the lookup has actually settled,
  // so a hung lookup stays here instead of bouncing to /login.
  const sessionCheckFailed = !isAuthenticated && authError;
  if (sessionCheckFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-on-surface">
        <div className="w-full max-w-md rounded-2xl border border-[#eceef0] bg-surface-container-lowest p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold tracking-tight">Couldn&apos;t check your session</h1>
          <p className="mt-2 text-sm text-on-surface/70">
            A network or server error interrupted the sign-in check. Please try again.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 bg-[#93000b] hover:bg-[#770008] text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              <Icon name="login" className="text-[16px]" />
              Sign in
            </a>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:bg-[#f7f9fb] px-4 py-2.5 rounded-lg transition-colors"
            >
              <Icon name="refresh" className="text-[16px]" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <BizLedgerLoader size="lg" label="Loading BizLedger" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Session fetch finished with no authenticated user (not an authError, which
    // is handled above). Brief frame before the effect's /login redirect.
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <BizLedgerLoader size="lg" label="Redirecting to login" />
      </div>
    );
  }

  // During the onboarding wizard we render as a standalone full-screen flow
  // (no dashboard chrome) so the user can focus on setup.
  if (isOnboardingPath(pathname)) {
    return <>{children}</>;
  }

  // Authenticated but onboarding not yet complete and not on an onboarding
  // route -> the effect is redirecting the user to the pending step.
  if (!onboarding.completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <BizLedgerLoader size="lg" label="Loading BizLedger" />
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
