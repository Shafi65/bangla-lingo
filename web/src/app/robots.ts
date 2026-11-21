import type { MetadataRoute } from "next";
import { ALLOW_INDEXING } from "@/lib/indexing";

// Blocked everywhere unless NEXT_PUBLIC_ALLOW_INDEXING=1. The reviewer tool is never offered to crawlers.
export default function robots(): MetadataRoute.Robots {
  if (!ALLOW_INDEXING) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/reviewer", "/translate/api", "/offline/precache.json"] } };
}
