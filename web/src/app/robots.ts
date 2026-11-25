import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, INDEX_WORD_PAGES, SITE_URL, WORD_PAGES_PATH } from "@/lib/indexing";

// Blocked everywhere unless NEXT_PUBLIC_ALLOW_INDEXING=1. NEXT_PUBLIC_INDEX_WORD_PAGES=1 opens only the
// public word pages (plus the static files they need to render). The reviewer tool is never offered to crawlers.
export default function robots(): MetadataRoute.Robots {
  if (ALLOW_INDEXING) {
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/reviewer", "/translate/api", "/offline/precache.json"] },
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }
  if (INDEX_WORD_PAGES) {
    return {
      rules: { userAgent: "*", allow: [`${WORD_PAGES_PATH}$`, `${WORD_PAGES_PATH}/`, "/_next/static/"], disallow: "/" },
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
