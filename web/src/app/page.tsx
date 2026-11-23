import { CourseMap } from "@/components/CourseMap";
import { OnboardingRedirect } from "@/components/onboarding/OnboardingRedirect";
import { getCourse } from "@/lib/content";
import { getStories } from "@/lib/stories/load";

export default function Home() {
  return (
    <>
      <OnboardingRedirect />
      <CourseMap course={getCourse()} storyIds={getStories().map((s) => s.id)} />
    </>
  );
}
