import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { getCourse } from "@/lib/content";

export const metadata: Metadata = { title: "Welcome · BanglaLingo" };

export default function WelcomePage() {
  const course = getCourse();
  const mainUnit = course.units.find((u) => u.track === "main");
  const scriptUnit = course.units.find((u) => u.track === "script");
  const first = mainUnit?.lessons[0]?.id ?? course.units[0]?.lessons[0]?.id;
  return (
    <OnboardingFlow
      unit1LessonId={first}
      alphabetLessonId={scriptUnit?.lessons[0]?.id ?? first}
      hasAlphabet={!!scriptUnit}
    />
  );
}
