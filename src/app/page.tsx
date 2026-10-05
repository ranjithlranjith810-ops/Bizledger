"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { resolveHomeRoute } from "@/lib/constants";
import { ONBOARDING_HOME_EXIT_KEY, safeSessionGet, safeSessionRemove } from "@/lib/storage";
import { LandingView } from "@/components/auth/LandingView";
import { BizLedgerLoader } from "@/components/ui/BizLedgerLoader";

// Per-tab sessionStorage is an external store, so read it through the
// useSyncExternalStore API (reading it as plain state in an effect would need a
// cascading setState; this way the value just updates on mount/hydration and no
// effect re-render is required). Snapshot is SSR-safe (returns false on server).
function homeExitSnapshot(): boolean {
  return safeSessionGet(ONBOARDING_HOME_EXIT_KEY) === "1";
}
function noopSubscribe(): () => void {
  return () => {};
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, lastRoute } = useAuth();
  const { onboarding } = useApp();
  // True only when this tab explicitly left the onboarding wizard via "Home".
  // The flag is consumed once so the public landing page is reachable for an
  // authenticated, incomplete account WITHOUT disabling the onboarding guard
  // for every other entry (signup/login redirects, direct visits, refresh).
  const exitedToLanding = useSyncExternalStore(noopSubscribe, homeExitSnapshot, homeExitSnapshot);

  useEffect(() => {
    if (exitedToLanding) return;
    const decision = resolveHomeRoute({
      isAuthenticated,
      onboarding,
      lastRoute,
      exitedToLanding: false,
    });
    if (decision.redirectTo) {
      router.replace(decision.redirectTo);
    }
  }, [isAuthenticated, lastRoute, router, exitedToLanding, onboarding.completed, onboarding.currentStep]);

  // One-shot: clear the flag after it has been consumed so later `/` visits are
  // routed by the normal guard. Storage write only — deliberately not a setState.
  useEffect(() => {
    if (exitedToLanding) {
      safeSessionRemove(ONBOARDING_HOME_EXIT_KEY);
    }
  }, [exitedToLanding]);

  const decision = resolveHomeRoute({
    isAuthenticated,
    onboarding,
    lastRoute,
    exitedToLanding,
  });

  if (decision.showLanding) {
    return <LandingView />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
      <BizLedgerLoader size="lg" label="Loading BizLedger" />
    </div>
  );
}
