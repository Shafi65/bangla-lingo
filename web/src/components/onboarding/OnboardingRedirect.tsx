"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { shouldShowOnboarding, readOnboarding } from "@/lib/onboarding";
import { progressStore } from "@/lib/progress";

/** Sends first-time visitors (no intro flag, no progress) to /welcome. Renders nothing. */
export function OnboardingRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (shouldShowOnboarding(progressStore.get(), readOnboarding())) router.replace("/welcome");
  }, [router]);
  return null;
}
