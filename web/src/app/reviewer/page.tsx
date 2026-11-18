import type { Metadata } from "next";
import { ReviewerIndex } from "@/components/reviewer/ReviewerIndex";
import { getReviewIndex } from "@/lib/reviewer/data";
import { REVIEWER_ROBOTS } from "@/lib/reviewer/robots";

export const metadata: Metadata = { title: "Reviewer · BanglaLingo", robots: REVIEWER_ROBOTS };

export default function ReviewerPage() {
  return <ReviewerIndex levels={getReviewIndex()} />;
}
