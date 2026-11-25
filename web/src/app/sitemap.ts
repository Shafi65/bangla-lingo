import type { MetadataRoute } from "next";
import { ALLOW_INDEXING, INDEX_WORD_PAGES, SITE_URL, WORD_PAGES_PATH } from "@/lib/indexing";
import { getWordPages } from "@/lib/wordpages/data";

// Lists only pages search engines may index (see robots.ts): nothing during the closed beta.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!INDEX_WORD_PAGES) return [];
  return [
    ...(ALLOW_INDEXING ? [{ url: `${SITE_URL}/`, changeFrequency: "weekly" as const, priority: 1 }] : []),
    { url: `${SITE_URL}${WORD_PAGES_PATH}`, changeFrequency: "weekly", priority: 0.8 },
    ...getWordPages().map((p) => ({
      url: `${SITE_URL}${WORD_PAGES_PATH}/${p.slug}`,
      changeFrequency: "monthly" as const,
      priority: p.lesson ? 0.6 : 0.4,
    })),
  ];
}
