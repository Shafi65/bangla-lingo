// Static JSON: the bn -> word id index used to map lesson answers to words
// (see lib/memory.ts). Generated at build time from content/.
import { getWordIndex } from "@/lib/review/catalog";

export function GET() {
  return Response.json(getWordIndex(), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
