import { CourseMap } from "@/components/CourseMap";
import { getCourse } from "@/lib/content";

export default function Home() {
  return <CourseMap course={getCourse()} />;
}
