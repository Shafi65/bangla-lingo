import { CourseMap } from "@/components/CourseMap";
import { OnboardingRedirect } from "@/components/onboarding/OnboardingRedirect";
import { getCourse } from "@/lib/content";

export default function Home() {
  return (
    <>
      <OnboardingRedirect />
      <CourseMap course={getCourse()} />
    </>
  );
}
