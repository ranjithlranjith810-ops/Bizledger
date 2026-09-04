"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ROUTES, onboardingRouteForStep } from "@/lib/constants";
import { LEGAL_LINKS } from "@/config/legal";
import { canAccessRoute, OWNER_PERMISSIONS } from "@/lib/permissions";

// Public marketing/auth paths plus the standalone legal / policy documents.
// Legal pages are intentionally accessible without logging in or completing an
// onboarding wizard (they are not part of the authenticated dashboard shell).
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
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
  return PUBLIC_PATHS.has(path);
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

export { isValidAppRoute };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, setLastRoute } = useAuth();
  const { onboarding } = useApp();

  useEffect(() => {
    if (isPublicPath(pathname)) return;
    if (!isAuthenticated) {
      router.replace("/");
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
    // the pending step (unless they are already on an onboarding route).
    if (!onboarding.completed && !isOnboardingPath(pathname)) {
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
    if (isValidAppRoute(pathname)) {
      setLastRoute(pathname);
    }
  }, [pathname, router, setLastRoute, isAuthenticated, onboarding.completed, onboarding.currentStep]);

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <span className="material-symbols-outlined animate-spin">
          progress_activity
        </span>
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
        <span className="material-symbols-outlined animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
