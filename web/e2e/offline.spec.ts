import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Offline support against the production build: the service worker precaches the shell and pages,
// a reload of a lesson still works with the network off, and audio packs download / serve / remove.

const LESSON_ID = "u01-l01";
const lesson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "..", "content", "units", "u01-basics", `${LESSON_ID}.json`), "utf8"),
) as { exercises: { type: string; options?: string[]; answer?: number }[] };

/** Waits until the worker controls the page and has finished precaching (the lesson page is stored). */
async function waitForOfflineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async (lessonPath) => {
          if (!navigator.serviceWorker?.controller) return false;
          for (const name of await caches.keys()) {
            if (!name.startsWith("bl-shell-")) continue;
            const cache = await caches.open(name);
            const keys = (await cache.keys()).map((r) => new URL(r.url).pathname);
            if (keys.includes(lessonPath) && keys.includes("/offline") && keys.includes("/words")) return true;
          }
          return false;
        }, `/lesson/${LESSON_ID}`),
      { timeout: 45_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
}

test("a lesson loaded once still opens and plays after going offline", async ({ page, context }) => {
  await page.goto(`/lesson/${LESSON_ID}`);
  await expect(page.getByRole("button", { name: /start lesson/i })).toBeVisible();
  await waitForOfflineReady(page);

  // Online: no offline pill.
  await expect(page.getByText(/you.re offline/i)).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText(/you.re offline.*still work/i)).toBeVisible();

  await page.reload();
  const start = page.getByRole("button", { name: /start lesson/i });
  await expect(start).toBeVisible();
  await expect(page.getByText(/you.re offline/i)).toBeVisible();
  await start.click();

  const first = lesson.exercises[0];
  if (first.type !== "select_translation" || !first.options || first.answer === undefined) {
    throw new Error("test assumes the first exercise is select_translation");
  }
  const group = page.getByRole("group", { name: /answer options/i });
  await expect(group).toBeVisible();
  await group.getByRole("button").filter({ has: page.getByText(first.options[first.answer], { exact: true }) }).click();
  await page.getByRole("button", { name: /^check$/i }).click();
  // (The offline pill is also a status region; the lesson's feedback panel is the other one.)
  const feedback = page.getByRole("status").filter({ hasNotText: /you.re offline/i });
  await expect(feedback).toBeVisible();
  await expect(feedback).not.toContainText(/not quite/i);
  await page.getByRole("button", { name: /^continue$/i }).click();

  // Back online: the pill goes away.
  await context.setOffline(false);
  await expect(page.getByText(/you.re offline/i)).toHaveCount(0);
});

test("pages that were never opened still load offline (precached), and unknown ones fall back to /offline", async ({ page, context }) => {
  await page.goto("/");
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.goto("/words");
  await expect(page.getByRole("heading", { name: /my words|words/i }).first()).toBeVisible();
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: /guide/i }).first()).toBeVisible();
  // Not part of the course: the worker sends the browser to the offline screen.
  await page.goto("/lesson/definitely-not-a-lesson");
  await expect(page).toHaveURL(/\/offline$/);
  await expect(page.getByRole("heading", { name: /^offline$/i })).toBeVisible();
  await context.setOffline(false);
});

test("audio pack downloads, plays from cache with Range requests while offline, and can be removed", async ({ page, context }) => {
  await page.goto("/offline");
  await waitForOfflineReady(page);
  await expect(page.getByRole("heading", { name: /audio for offline/i })).toBeVisible();
  await expect(page.getByTestId("offline-lessons-status")).toContainText(/lessons are saved/i);

  // First unit row (after "All audio").
  const firstUnit = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^download/i }) }).nth(1);
  const title = (await firstUnit.locator("p").first().innerText()).trim();
  const row = page.getByRole("listitem").filter({ has: page.getByText(title, { exact: true }) });
  await row.getByRole("button", { name: /^download/i }).click();
  await expect(row.getByText("Downloaded")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: /remove downloaded audio/i })).toBeVisible();

  const file = await page.evaluate(async () => {
    const cache = await caches.open("bl-audio-v1");
    const keys = await cache.keys();
    return keys.length ? new URL(keys[0].url).pathname : null;
  });
  expect(file).toMatch(/^\/audio\/.+\.mp3$/);

  await context.setOffline(true);
  const r = await page.evaluate(async (f) => {
    const res = await fetch(f!, { headers: { Range: "bytes=0-9" } });
    return { status: res.status, len: (await res.arrayBuffer()).byteLength, type: res.headers.get("content-type") };
  }, file);
  expect(r).toEqual({ status: 206, len: 10, type: expect.stringContaining("audio") });
  await context.setOffline(false);

  await page.getByRole("button", { name: /remove downloaded audio/i }).click();
  await expect(page.getByRole("button", { name: /remove downloaded audio/i })).toHaveCount(0);
  expect(await page.evaluate(() => caches.has("bl-audio-v1"))).toBe(false);
});
