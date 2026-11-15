// Pure: cache naming. Must stay in step with public/sw.js (tests/offline-sw.test.ts checks this).

export const AUDIO_CACHE = "bl-audio-v1";
export const SHELL_PREFIX = "bl-shell-";
export const SW_PATH = "/sw.js";
export const PRECACHE_MANIFEST_URL = "/offline/precache.json";

/** Keeps only characters that are safe in a cache name / URL query. */
export function sanitizeBuildId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "dev";
}

export const shellCacheName = (buildId: string) => SHELL_PREFIX + sanitizeBuildId(buildId);

/** The script URL to register: one URL per build so a deploy always installs a fresh worker. */
export const swUrl = (buildId: string) => `${SW_PATH}?b=${encodeURIComponent(sanitizeBuildId(buildId))}`;

export const audioUrl = (file: string) => `/audio/${file}`;
