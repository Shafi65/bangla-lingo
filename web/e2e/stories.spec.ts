import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Graded stories (/stories, /stories/[id]) against the production build.
// STORY_SHOTS=<dir> also saves 390px screenshots there.

const PROGRESS_KEY = "banglalingo.progress.v1";
const STORIES_KEY = "banglalingo.stories.v1";
const SHOTS = process.env.STORY_SHOTS;

interface QuestionJson {
  after: number;
  options: unknown[];
  answer: number;
  why: string;
}
const STORY_ID = "u02-pronouns-story";
const story = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "..", "content", "stories", `${STORY_ID}.json`), "utf8"),
) as { lines: { bn: string }[]; questions: QuestionJson[] };

async function seed(page: Page, completed: string[]) {
  await page.addInitScript(
    ([ids, key]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("banglalingo.onboarding.v1", JSON.stringify({ version: 1, completed: true, skipped: true }));
      const c: Record<string, unknown> = {};
      for (const id of ids as string[]) c[id] = { completedAt: "2026-11-20T10:00:00.000Z", bestAccuracy: 0.9, timesCompleted: 1 };
      localStorage.setItem(
        key as string,
        JSON.stringify({ version: 1, xp: 40, streak: 1, lastActiveDate: "2026-11-20", completed: c, daily: { "2026-11-20": 40 }, settings: {} }),
      );
    },
    [completed, PROGRESS_KEY] as const,
  );
}

async function noSidewaysScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
}

test("the list groups stories by unit and unlocks them with the unit's first lesson", async ({ page }) => {
  await seed(page, ["u01-l01", "u02-l01"]);
  if (SHOTS) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/stories");
  await expect(page.getByRole("heading", { level: 1, name: "Stories" })).toBeVisible();
  const cards = page.getByTestId("story-card");
  await expect(cards).toHaveCount(14);
  await expect(page.locator(`[data-story-id="${STORY_ID}"]`)).toHaveAttribute("data-unlocked", "true");
  await expect(page.locator('[data-story-id="u03-family-story"]')).toHaveAttribute("data-unlocked", "false");
  await expect(page.locator('[data-story-id="u03-family-story"]')).toContainText("Finish the first lesson of Unit 3");
  await expect(page.getByRole("heading", { level: 2, name: /Unit 2 · / })).toBeVisible();
  await expect(page.getByTestId("stories-count")).toHaveText("0 of 14 read");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "stories-list-390.png"), fullPage: false });
});

test("a locked story says how to unlock it", async ({ page }) => {
  await seed(page, ["u01-l01"]);
  await page.goto("/stories/u05-numbers-time-story");
  await expect(page.getByRole("heading", { name: "This story is locked" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the lesson" })).toHaveAttribute("href", "/lesson/u05-l01");
});

test("read a story: line by line, word glosses, questions, score; no XP change", async ({ page }) => {
  await seed(page, ["u01-l01", "u02-l01"]);
  if (SHOTS) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/stories/${STORY_ID}`);
  const progressBefore = await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);

  const lines = page.getByTestId("story-line");
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText(story.lines[0].bn.replace(/।/g, "").split(" ")[0]);

  // Tap a word: the gloss card opens with the meaning; Escape closes it and returns focus.
  const word = lines.first().getByTestId("story-word").filter({ hasText: "আমি" });
  await word.click();
  const gloss = page.getByTestId("story-gloss");
  await expect(gloss).toBeVisible();
  await expect(gloss.getByTestId("story-gloss-en")).toContainText("I");
  await expect(gloss).toContainText("ami");
  await expect(gloss.getByRole("button", { name: /Play audio: আমি/ })).toBeVisible();
  await expect(word).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(gloss).toHaveCount(0);
  await expect(word).toBeFocused();
  // Keyboard: Enter opens it again.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("story-gloss")).toBeVisible();
  await page.getByTestId("story-gloss").getByRole("button", { name: "Close" }).click();

  const cont = page.getByTestId("story-continue");
  let shotTaken = false;
  for (let qi = 0, guard = 0; guard < 40; guard++) {
    if ((await cont.textContent())?.includes("Finish")) {
      await cont.click();
      break;
    }
    await cont.click();
    const q = page.locator(`[data-testid="story-question"][data-question-index="${qi}"]`);
    if ((await q.count()) && !(await q.getByTestId("story-feedback").count())) {
      await expect(cont).toBeDisabled();
      const meta = story.questions[qi];
      const right = qi !== 1; // answer the second question wrongly
      const idx = right ? meta.answer : meta.options.findIndex((_, k) => k !== meta.answer);
      if (SHOTS && !shotTaken) {
        shotTaken = true;
        await page.screenshot({ path: path.join(SHOTS, "story-question-390.png") });
      }
      await q.locator(`[data-option-index="${idx}"]`).click();
      const fb = q.getByTestId("story-feedback");
      await expect(fb).toHaveAttribute("data-correct", right ? "true" : "false");
      await expect(cont).toBeFocused();
      qi++;
    }
  }

  await expect(page.getByRole("heading", { level: 1, name: "Story complete" })).toBeFocused();
  const total = story.questions.length;
  await expect(page.getByTestId("story-score")).toHaveText(`${total - 1}/${total}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "story-end-390.png") });

  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), STORIES_KEY);
  expect(saved.v).toBe(1);
  expect(saved.done[STORY_ID]).toMatchObject({ best: total - 1, last: total - 1, total, times: 1 });
  expect(await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY)).toBe(progressBefore);

  await page.getByTestId("story-end").getByRole("link", { name: "All stories" }).click();
  await expect(page.locator(`[data-story-id="${STORY_ID}"]`)).toContainText(`best ${total - 1} of ${total}`);
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });
  for (const scheme of ["light", "dark"] as const) {
    test(`no sideways scroll at 360px (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await seed(page, ["u01-l01", "u02-l01", "u13-l01"]);
      await page.goto("/stories");
      await page.waitForLoadState("networkidle");
      await noSidewaysScroll(page);
      await page.goto("/stories/u13-requests-story");
      const cont = page.getByTestId("story-continue");
      await cont.click(); // line 2; the first question follows it
      await page.getByTestId("story-word").first().click();
      await expect(page.getByTestId("story-gloss")).toBeVisible();
      await noSidewaysScroll(page);
      const box = await cont.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const wb = await page.getByTestId("story-word").first().boundingBox();
      expect(wb!.height).toBeGreaterThanOrEqual(44);
    });
  }
});
