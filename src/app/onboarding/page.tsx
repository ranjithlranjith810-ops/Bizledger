"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { onboardingRouteForStep } from "@/lib/constants";

export default function OnboardingIndex() {
  const router = useRouter();
  const { onboarding } = useApp();

  useEffect(() => {
    router.replace(onboardingRouteForStep(onboarding.currentStep));
  }, [router, onboarding.currentStep]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-on-surface">
      <span className="material-symbols-outlined animate-spin">progress_activity</span>
    </div>
  );
}
