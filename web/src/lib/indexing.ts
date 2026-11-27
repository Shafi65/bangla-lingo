import type { Metadata } from "next";

/**
 * Search engines are kept out during the private beta. Set NEXT_PUBLIC_ALLOW_INDEXING=1 (at build
 * time) to allow them. Reviewer pages set their own noindex and stay blocked either way.
 */
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";

export const SITE_ROBOTS: Metadata["robots"] | undefined = ALLOW_INDEXING ? undefined : { index: false, follow: false };

/**
 * The public word pages (/bengali/...) can be opened to search engines on their own, while the rest
 * of the beta stays hidden: set NEXT_PUBLIC_INDEX_WORD_PAGES=1 at build time. Full indexing implies it.
 */
export const INDEX_WORD_PAGES = ALLOW_INDEXING || process.env.NEXT_PUBLIC_INDEX_WORD_PAGES === "1";

/** Robots metadata for the word pages: overrides the site-wide noindex when they are opened. */
export const WORD_PAGE_ROBOTS: Metadata["robots"] = INDEX_WORD_PAGES ? { index: true, follow: true } : { index: false, follow: false };

/** Path prefix of the public word pages. */
export const WORD_PAGES_PATH = "/bengali";

/**
 * Public origin for canonical links, sitemaps and share cards: NEXT_PUBLIC_SITE_URL, else Vercel's
 * production domain, else the beta domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://bangla-lingo.vercel.app")
).replace(/\/+$/, "");
