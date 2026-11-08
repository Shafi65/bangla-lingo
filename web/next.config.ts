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

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    BL_AUDIO_MANIFEST: audioManifest(),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
