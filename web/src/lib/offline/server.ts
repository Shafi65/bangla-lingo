import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getCourse, getLesson } from "@/lib/content";
import { getGuideUnits } from "@/lib/guide/data";
import { buildAudioPacks, collectStrings, type AudioPackData } from "./audio-packs";
import { pageRoutesFromManifest, shellRoutes } from "./routes";

const WEB_ROOT = process.cwd();

function contentDir(): string {
  return process.env.CONTENT_DIR ? path.resolve(process.env.CONTENT_DIR) : path.join(/* turbopackIgnore: true */ WEB_ROOT, "..", "content");
}

export function distDir(): string {
  return path.join(/* turbopackIgnore: true */ WEB_ROOT, process.env.NEXT_DIST_DIR || ".next");
}

/** Page routes the service worker precaches (home, lessons, guide, tools, /offline). */
export function getShellRoutes(): string[] {
  let extra: string[] = [];
  try {
    const m = JSON.parse(fs.readFileSync(path.join(distDir(), "server", "app-path-routes-manifest.json"), "utf8"));
    extra = pageRoutesFromManifest(Object.values(m).filter((v): v is string => typeof v === "string"));
  } catch {
    // Not built yet (or not readable): the fixed list below still covers the course.
  }
  return shellRoutes({
    extra,
    lessonIds: getCourse().units.flatMap((u) => u.lessons.map((l) => l.id)),
    guideUnitIds: getGuideUnits().map((u) => u.id),
  });
}

/** Per-unit audio packs from content/audio/manifest.json, matched through the lessons' text. */
export function getAudioPacks(): AudioPackData {
  let items: Record<string, string> = {};
  try {
    const m = JSON.parse(fs.readFileSync(path.join(contentDir(), "audio", "manifest.json"), "utf8"));
    if (m && typeof m.items === "object" && m.items) items = m.items;
  } catch {
    // No recorded audio: the panel shows nothing to download.
  }
  const audioDir = path.join(/* turbopackIgnore: true */ WEB_ROOT, "public", "audio");
  const sizeOf = (file: string) => {
    try {
      return fs.statSync(path.join(audioDir, file)).size;
    } catch {
      return 0;
    }
  };
  // Drop clips whose file is not shipped, so a download never 404s.
  const shipped: Record<string, string> = {};
  for (const [k, f] of Object.entries(items)) if (sizeOf(f) > 0) shipped[k] = f;

  const units = getCourse().units.map((u) => {
    const texts = new Set<string>();
    for (const l of u.lessons) {
      const lesson = getLesson(l.id);
      if (lesson) collectStrings(lesson, texts);
    }
    return { id: u.id, title: u.title, texts };
  });
  return buildAudioPacks(units, shipped, sizeOf);
}

export function getBuildId(): string {
  try {
    const id = fs.readFileSync(path.join(distDir(), "BUILD_ID"), "utf8").trim();
    if (id) return id;
  } catch {
    // On serverless hosts the function bundle has no .next/BUILD_ID; use the platform's id instead.
  }
  // Must change on every deploy: it names the service worker's cache, so a fixed value would
  // keep serving a stale app shell.
  return process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev";
}

/** Hashed build files (JS, CSS, fonts) under .next/static, as /_next/static/... URLs. */
export function listStaticAssets(): string[] {
  const root = path.join(distDir(), "static");
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!e.name.endsWith(".map")) {
        const rel = path.relative(root, full).split(path.sep).map(encodeURIComponent).join("/");
        out.push(`/_next/static/${rel}`);
      }
    }
  };
  walk(root);
  return out.sort();
}
