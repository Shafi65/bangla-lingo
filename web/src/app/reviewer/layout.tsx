import type { Metadata } from "next";
import { ReviewerBar } from "@/components/reviewer/ReviewerBar";
import { getLessonOrder } from "@/lib/reviewer/data";
import { REVIEWER_ROBOTS } from "@/lib/reviewer/robots";

export const metadata: Metadata = {
  title: "Reviewer · BanglaLingo",
  robots: REVIEWER_ROBOTS,
};

export default function ReviewerLayout({ children }: LayoutProps<"/reviewer">) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <ReviewerBar lessonOrder={getLessonOrder()} />
      {children}
    </div>
  );
}
