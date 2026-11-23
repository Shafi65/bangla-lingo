import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Pre-generated audio manifest (content/audio/manifest.json, written by
 * `npm run gen:audio`). Inlined into the client bundle at build time; a
 * missing or invalid file just means "no recorded audio".
 */
function audioManifest(): string {
  const contentDir = process.env.CONTENT_DIR
    ? path.resolve(process.env.CONTENT_DIR)
    : path.join(process.cwd(), "..", "content");
  try {
    const m = JSON.parse(fs.readFileSync(path.join(contentDir, "audio", "manifest.json"), "utf8"));
    const items = m && typeof m.items === "object" && m.items ? m.items : {};
    return JSON.stringify({ voice: typeof m.voice === "string" ? m.voice : null, items });
  } catch {
    return JSON.stringify({ voice: null, items: {} });
  }
}

// The repo root (web/ lives one level below it). Course data is read from ../content at run time by
// some routes, so the file tracer must be allowed to look outside web/. On Vercel this needs
// "Include files outside the root directory in the Build Step" (see docs/DEPLOY.md).
const REPO_ROOT = path.resolve(process.cwd(), "..");

// Search engines stay out during the private beta. Set NEXT_PUBLIC_ALLOW_INDEXING=1 to allow them.
const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "1";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone only for this origin (speaking practice); nothing else is used.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
  // Not embeddable anywhere. Deliberately no script/style CSP: Next injects inline scripts.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // The e2e suite builds the demo-fixture variant into its own folder (e2e/servers.mjs).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    BL_AUDIO_MANIFEST: audioManifest(),
  },
  outputFileTracingRoot: REPO_ROOT,
  // Files read with fs at request time are invisible to the tracer unless listed here (paths are
  // relative to web/). Without them a serverless deployment would silently fall back to the demo fixture.
  outputFileTracingIncludes: {
    "/*": [
      "../content/course.json",
      "../content/units/**/*.json",
      "../content/script/**/*.json",
      "../content/lexicon/**/*.json",
      "../content/plans/**/*.json",
      "../content/assumed/**/*.json",
      "../content/placement/**/*.json",
      "../content/formality/**/*.json",
      "../content/audio/manifest.json",
      "../content/sources/**/*.json",
      "../content/library/**/*.json",
      "src/fixtures/**/*.json",
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...(ALLOW_INDEXING
        ? []
        : [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]),
    ];
  },
  turbopack: {
    root: REPO_ROOT,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
