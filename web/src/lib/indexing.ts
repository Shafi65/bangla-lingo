import type { Metadata } from "next";

/**
 * Search engines are kept out during the private beta. Set NEXT_PUBLIC_ALLOW_INDEXING=1 (at build
 * time) to allow them. Reviewer pages set their own noindex and stay blocked either way.
 */
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";

export const SITE_ROBOTS: Metadata["robots"] | undefined = ALLOW_INDEXING ? undefined : { index: false, follow: false };
