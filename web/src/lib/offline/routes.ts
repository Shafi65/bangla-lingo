// Pure: which page routes the service worker precaches. Safe to import anywhere.

export const STATIC_ROUTES = [
  "/",
  "/practice",
  "/words",
  "/guide",
  "/dictionary",
  "/translate",
  "/settings",
  "/offline",
] as const;

/** Every built route needed to navigate the course offline, de-duplicated, "/" first. */
export function shellRoutes(opts: {
  lessonIds: readonly string[];
  guideUnitIds: readonly string[];
  /** Other built page routes (see pageRoutesFromManifest), so new top-level pages are picked up. */
  extra?: readonly string[];
}): string[] {
  const out = new Set<string>(STATIC_ROUTES);
  for (const r of opts.extra ?? []) out.add(r);
  for (const id of opts.guideUnitIds) out.add(`/guide/${encodeURIComponent(id)}`);
  for (const id of opts.lessonIds) out.add(`/lesson/${encodeURIComponent(id)}`);
  return [...out];
}

/**
 * Static page routes from Next's app-path-routes-manifest (values are route patterns): drops
 * dynamic segments (listed separately), file routes (icons, manifest, json), internals and
 * request handlers under an `api` segment (e.g. /translate/api, which only answers POST).
 */
export function pageRoutesFromManifest(values: readonly string[]): string[] {
  return values.filter(
    (r) =>
      r.startsWith("/") &&
      !r.includes("[") &&
      !r.startsWith("/_") &&
      !/\.[A-Za-z0-9]+$/.test(r) &&
      !/(^|\/)api(\/|$)/.test(r),
  );
}
