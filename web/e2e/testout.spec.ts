import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Test out of Units 1–3 through the first checkpoint (u03-c01). The lesson JSON is read from content/
// so the test follows content changes; options and tiles are shuffled, so they are picked by text.

const CHECKPOINT = "u03-c01";
const PROGRESS_KEY = "banglalingo.progress.v1";
const MEMORY_KEY = "banglalingo.memory.v1";
const SHOTS = process.env.SHOT_DIR; // set to also save screenshots

type Tr = { bn: string; en: string };
type Ex =
  | { id: string; type: "select_translation" | "listen_select" | "script_recognize" | "listen_meaning" | "reading"; options: string[]; answer: number }
  | { id: string; type: "fill_blank"; options?: string[]; answer?: number; accepted?: string[] }
  | { id: string; type: "word_bank"; answer: string[] }
  | { id: string; type: "type_translation"; accepted: string[] }
  | { id: string; type: "match_pairs"; pairs: Tr[] };

const lesson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "..", "content", "units", "u03-family", `${CHECKPOINT}.json`), "utf8"),
) as { title: string; exercises: Ex[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("banglalingo.onboarding.v1"))
      localStorage.setItem("banglalingo.onboarding.v1", JSON.stringify({ version: 1, completed: true, skipped: true }));
  });
});

const stored = (page: Page, key: string) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, key);

function buttonWithText(page: Page, text: string, scope: Page | Locator = page): Locator {
  return scope.getByRole("button").filter({ has: page.getByText(text, { exact: true }) });
}

async function pick(page: Page, text: string) {
  await buttonWithText(page, text, page.getByRole("group", { name: /answer options/i })).click();
}

async function answer(page: Page, ex: Ex, right: boolean) {
  switch (ex.type) {
    case "select_translation":
    case "listen_select":
    case "script_recognize":
    case "listen_meaning":
    case "reading": {
      const i = right ? ex.answer : ex.options.findIndex((_, j) => j !== ex.answer);
      await pick(page, ex.options[i]);
      break;
    }
    case "fill_blank": {
      if (ex.options && ex.answer !== undefined) {
        const i = right ? ex.answer : ex.options.findIndex((_, j) => j !== ex.answer);
        await pick(page, ex.options[i]);
      } else {
        await page.getByRole("textbox", { name: /your answer/i }).fill(right ? ex.accepted![0] : "zzz");
      }
      break;
    }
    case "match_pairs":
      for (const pair of ex.pairs) {
        await buttonWithText(page, pair.bn).first().click();
        await page.getByRole("button", { name: pair.en, exact: true }).first().click();
      }
      break;
    case "word_bank":
      for (const tile of ex.answer) {
        await page
          .getByRole("button", { name: /^(?!Remove )/ })
          .filter({ has: page.getByText(tile, { exact: true }) })
          .first()
          .click();
      }
      break;
    case "type_translation":
      await page.getByRole("textbox", { name: /your answer/i }).fill(ex.accepted[0]);
      break;
  }
}

async function checkAndContinue(page: Page) {
  await page.getByRole("button", { name: /^check$/i }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.getByRole("button", { name: /^continue$/i }).click();
}

async function startTestOut(page: Page) {
  await page.goto("/");
  const card = page.getByRole("region", { name: "Test out of Units 1–3" });
  await card.getByRole("link", { name: /test out/i }).click();
  await expect(page).toHaveURL(new RegExp(`/lesson/${CHECKPOINT}\\?mode=testout$`));
  await expect(page.getByRole("heading", { level: 1, name: "Test out of Units 1–3" })).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByRole("progressbar", { name: /test-out progress/i })).toBeVisible();
}

test("passing the checkpoint test-out marks Units 1–3 as tested out, with no XP or streak", async ({ page }) => {
  await page.goto("/");
  if (SHOTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.getByRole("region", { name: "Test out of Units 1–3" });
    await card.scrollIntoViewIfNeeded();
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, "01-map-test-out-offer-390.png") });
    await page.setViewportSize({ width: 900, height: 900 });
  }
  await startTestOut(page);
  for (const ex of lesson.exercises) {
    await answer(page, ex, true);
    await checkAndContinue(page);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Tested out of Units 1–3" })).toBeVisible();

  const p = await stored(page, PROGRESS_KEY);
  expect(p.xp).toBe(0);
  expect(p.streak).toBe(0);
  expect(p.lastActiveDate).toBeNull();
  expect(p.daily ?? {}).toEqual({});
  const done = Object.keys(p.completed);
  for (const id of ["u01-l01", "u02-l01", "u03-l01", CHECKPOINT]) expect(done).toContain(id);
  expect(done.some((id) => /^s\d/.test(id))).toBe(false); // the script track is separate
  expect(done.some((id) => id.startsWith("u04"))).toBe(false);
  expect(p.completed["u01-l01"]).toMatchObject({ placed: true, via: "checkpoint", bestAccuracy: 0, timesCompleted: 0 });
  expect(await stored(page, MEMORY_KEY)).toBeNull(); // nothing seeded or recorded

  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Tested out", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /marked done by a checkpoint test-out/i }).first()).toBeVisible();
  await expect(page.getByText("Placed", { exact: true })).toHaveCount(0);
  // The offer moves on to the next checkpoint.
  await expect(page.getByRole("region", { name: "Test out of Units 1–3" })).toHaveCount(0);

  if (SHOTS) {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByText("Tested out", { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, "02-map-tested-out-dark-390.png") });
  }

  // Profile: tested-out lessons are not effort.
  await page.goto("/profile");
  expect((await stored(page, PROGRESS_KEY)).xp).toBe(0);
});

test("failing the test-out changes nothing", async ({ page }) => {
  await startTestOut(page);
  let wrong = 0;
  for (const ex of lesson.exercises) {
    const mistake = wrong < 5 && "options" in ex && ex.options !== undefined;
    await answer(page, ex, !mistake);
    if (mistake) wrong++;
    await checkAndContinue(page);
    if (wrong >= 5) break;
  }
  await expect(page.getByRole("heading", { level: 1, name: "Not this time" })).toBeVisible();
  await expect(page.getByText(/nothing on your map has changed/i)).toBeVisible();
  expect(await stored(page, PROGRESS_KEY)).toBeNull();
  expect(await stored(page, MEMORY_KEY)).toBeNull();

  await page.getByRole("link", { name: "Back to the map" }).click();
  await expect(page.getByText("Tested out", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Test out of Units 1–3" })).toBeVisible();
  expect(await stored(page, PROGRESS_KEY)).toBeNull();
});

test("without ?mode=testout, or for a later checkpoint, the checkpoint is an ordinary lesson", async ({ page }) => {
  await page.goto(`/lesson/${CHECKPOINT}`);
  await expect(page.getByRole("button", { name: /start lesson/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start the test" })).toHaveCount(0);
  await page.goto("/lesson/u06-c01?mode=testout"); // only the next checkpoint ahead can be tested out
  await expect(page.getByRole("button", { name: /start lesson/i })).toBeVisible();
});

test.describe("at 360px in dark mode", () => {
  test.use({ viewport: { width: 360, height: 780 }, colorScheme: "dark" });
  test("the test-out entry fits and its targets are at least 44px", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("region", { name: "Test out of Units 1–3" });
    await card.scrollIntoViewIfNeeded();
    const link = card.getByRole("link", { name: /test out/i });
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await link.click();
    await expect(page.getByRole("button", { name: "Start the test" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
