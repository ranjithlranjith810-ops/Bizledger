"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { onboardingRouteForStep } from "@/lib/constants";
import { LandingView } from "@/components/auth/LandingView";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, lastRoute } = useAuth();
  const { onboarding } = useApp();

  useEffect(() => {
    if (!isAuthenticated) return;
    // Routing priority (see Phase 2): account onboarding status always wins
    // over a stale `lastRoute`. A completed account is NEVER sent back into an
    // onboarding step, and an incomplete account is NEVER granted a dashboard.
    if (!onboarding.completed) {
      router.replace(onboardingRouteForStep(onboarding.currentStep));
      return;
    }
    if (lastRoute && lastRoute !== "/" && lastRoute !== "/login" && lastRoute !== "/signup") {
      router.replace(lastRoute);
    } else {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, lastRoute, router, onboarding.completed, onboarding.currentStep]);

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
        <span className="material-symbols-outlined animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return <LandingView />;
}
