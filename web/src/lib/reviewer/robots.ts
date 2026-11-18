import type { Metadata } from "next";

/** Reviewer pages are for invited reviewers only: keep them out of search engines. */
export const REVIEWER_ROBOTS: NonNullable<Metadata["robots"]> = { index: false, follow: false };
