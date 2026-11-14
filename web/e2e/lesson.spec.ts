import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Reads the real lesson JSON so the test follows content changes. Options and
// tiles are shuffled in the UI, so everything is selected by visible text.
// Locators use roles / labels / text rather than CSS classes.

const LESSON_ID = "u01-l01";
const lesson = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "..", "content", "units", "u01-basics", `${LESSON_ID}.json`),
    "utf8",
  ),
) as { title: string; exercises: Ex[] };

type Tr = { bn: string; tr: string; en: string };
type Ex =
  | { id: string; type: "select_translation"; options: string[]; answer: number }
  | { id: string; type: "listen_select"; options: string[]; answer: number }
  | { id: string; type: "script_recognize"; options: string[]; answer: number }
  | { id: string; type: "word_bank"; tiles: string[]; answer: string[] }
  | { id: string; type: "type_translation"; accepted: string[] }
  | { id: string; type: "match_pairs"; pairs: Tr[] };

const STORAGE_KEY = "banglalingo.progress.v1";

async function progress(page: Page): Promise<{ xp: number; completed: Record<string, unknown> }> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : { xp: 0, completed: {} };
  }, STORAGE_KEY);
}

/** A button whose visible text includes exactly `text` in one element (ignores transliteration lines). */
function buttonWithText(page: Page, text: string, scope: Page | Locator = page): Locator {
  // `has` locators are matched relative to each button, so build them from `page`.
  return scope.getByRole("button").filter({ has: page.getByText(text, { exact: true }) });
}

async function startLesson(page: Page) {
  await page.goto(`/lesson/${LESSON_ID}`);
  const start = page.getByRole("button", { name: /start lesson/i });
  await expect(start).toBeVisible();
  await start.click();
  await expect(page.getByRole("progressbar", { name: /lesson progress/i })).toBeVisible();
}

async function answerCorrectly(page: Page, ex: Ex) {
  switch (ex.type) {
    case "select_translation":
    case "listen_select":
    case "script_recognize": {
      const group = page.getByRole("group", { name: /answer options/i });
      await expect(group).toBeVisible();
      await buttonWithText(page, ex.options[ex.answer], group).click();
      break;
    }
    case "match_pairs": {
      for (const pair of ex.pairs) {
        await buttonWithText(page, pair.bn).first().click();
        await page.getByRole("button", { name: pair.en, exact: true }).first().click();
      }
      break;
    }
    case "word_bank": {
      for (const tile of ex.answer) {
        // Picked tiles are labelled "Remove …" and used bank tiles are aria-hidden, so
        // this only ever finds a still-available bank tile.
        await page
          .getByRole("button", { name: /^(?!Remove )/ })
          .filter({ has: page.getByText(tile, { exact: true }) })
          .first()
          .click();
      }
      break;
    }
    case "type_translation": {
      await page.getByRole("textbox", { name: /your answer/i }).fill(ex.accepted[0]);
      break;
    }
  }
}

test("completes u01-l01 with every answer correct and earns XP", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(lesson.title, "i") }).first()).toBeVisible();
  const before = await progress(page);
  expect(before.xp).toBe(0);

  // Start from the course map (falls back to the direct URL if the link is restyled away).
  const link = page.getByRole("link", { name: new RegExp(lesson.title, "i") }).first();
  await link.click().catch(() => undefined);
  await page.waitForURL(new RegExp(`/lesson/${LESSON_ID}`), { timeout: 5_000 }).catch(() => undefined);
  if (!page.url().includes(`/lesson/${LESSON_ID}`)) await page.goto(`/lesson/${LESSON_ID}`);
  await page.getByRole("button", { name: /start lesson/i }).click();

  const hearts = page.getByRole("img", { name: /hearts left/i });
  const heartsBefore = await hearts.getAttribute("aria-label");

  for (const ex of lesson.exercises) {
    await answerCorrectly(page, ex);
    await page.getByRole("button", { name: /^check$/i }).click();
    const status = page.getByRole("status");
    await expect(status).toBeVisible();
    await expect(status).not.toContainText(/not quite/i);
    await page.getByRole("button", { name: /^continue$/i }).click();
  }

  // End screen.
  await expect(page.getByRole("heading", { name: /lesson complete/i })).toBeVisible();
  await expect(page.getByText(/xp earned/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /of 3 stars/i })).toBeVisible();
  expect(heartsBefore).toMatch(/hearts left/);

  const after = await progress(page);
  expect(after.xp).toBeGreaterThan(before.xp);
  expect(after.completed).toHaveProperty(LESSON_ID);

  // The map reflects it after leaving: progress persisted, next lesson reachable.
  await page.getByRole("link", { name: /^continue$/i }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await progress(page)).xp).toBe(after.xp);
});

test("a wrong answer shows the feedback panel and costs a heart", async ({ page }) => {
  await startLesson(page);
  const first = lesson.exercises[0];
  if (!("options" in first)) throw new Error("test assumes the first exercise is a single-choice question");

  const hearts = page.getByRole("img", { name: /hearts left/i });
  const count = async () => Number(/(\d+) of/.exec((await hearts.getAttribute("aria-label")) ?? "")?.[1]);
  const heartsBefore = await count();

  const wrong = first.options.findIndex((_, i) => i !== first.answer);
  const group = page.getByRole("group", { name: /answer options/i });
  await buttonWithText(page, first.options[wrong], group).click();
  await page.getByRole("button", { name: /^check$/i }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toContainText(/not quite/i);
  await expect(status).toContainText(/the answer is/i);
  await expect(status).toContainText(first.options[first.answer]);
  await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
  expect(await count()).toBe(heartsBefore - 1);

  // The missed question comes back at the end ("Another go…"), so the lesson isn't finished yet.
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("heading", { name: /lesson complete/i })).toHaveCount(0);
  expect((await progress(page)).xp).toBe(0);
});
