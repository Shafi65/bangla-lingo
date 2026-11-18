import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PROGRESS_KEY = "banglalingo.progress.v1";
const PLACEMENT_KEY = "banglalingo.placement.v1";

interface Item {
  id: string;
  exercise: { options: string[]; answer: number };
}
const bank = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "..", "content", "placement", "items.json"), "utf8"),
) as { items: Item[] };
const byId = new Map(bank.items.map((i) => [i.id, i]));

async function startTest(page: Page) {
  await page.goto("/placement");
  await expect(page.getByRole("heading", { level: 1, name: "Find where you start" })).toBeVisible();
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "A little about you" })).toBeFocused();
  const reads = page.getByRole("group", { name: "Can you read Bengali script?" });
  await reads.getByText("Yes", { exact: true }).click();
  await expect(reads.getByRole("radio", { name: "Yes" })).toBeChecked();
  await page.getByRole("button", { name: "Start the test" }).click();
}

/** Answer until the results screen; returns how many questions were shown. */
async function answerAll(page: Page, right: boolean): Promise<number> {
  let n = 0;
  const results = page.getByRole("heading", { level: 1, name: /^Start / });
  for (; n < 40; n++) {
    const q = page.locator("[data-item-id]");
    await expect(q.or(results).first()).toBeVisible();
    if (await results.isVisible()) break;
    const id = await q.getAttribute("data-item-id");
    // No right/wrong feedback in test mode: Next is the only way on.
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    if (right) {
      const item = byId.get(id!)!;
      const want = item.exercise.options[item.exercise.answer];
      await q.getByRole("group", { name: "Answer options" }).getByRole("button", { name: want, exact: true }).click();
      await page.getByRole("button", { name: "Next", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "I don't know" }).click();
    }
    await expect(page.locator(`[data-item-id="${id}"]`)).toHaveCount(0);
  }
  return n;
}

test("all correct places the learner in the intermediate track and marks the earlier lessons done", async ({ page }) => {
  await startTest(page);
  const shown = await answerAll(page, true);
  expect(shown).toBe(16); // perfect warm-up + top block ends the test early
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start at Intermediate Unit 1: Catching up");
  await expect(page.getByText("You start here")).toBeVisible();
  await expect(page.getByText("16 of 16 right")).toHaveCount(0); // scores are per skill
  await expect(page.getByText(/of \d+ right/)).toHaveCount(3);

  await page.getByRole("button", { name: "Start at Intermediate Unit 1" }).click();
  await expect(page).toHaveURL(/\/lesson\/i01-l01$/);
  const stored = await page.evaluate(
    ([p, k]) => ({ progress: JSON.parse(localStorage.getItem(p) ?? "{}"), placement: JSON.parse(localStorage.getItem(k) ?? "{}") }),
    [PROGRESS_KEY, PLACEMENT_KEY],
  );
  const done = Object.keys(stored.progress.completed ?? {});
  expect(done).toContain("u01-l01");
  expect(done).toContain("s01-l01");
  expect(done).toContain("u11-l01");
  expect(done.some((id) => id.startsWith("i01"))).toBe(false);
  expect(stored.progress.xp).toBe(0);
  expect(stored.placement).toMatchObject({ version: 1, accepted: true, route: "intermediate", startLessonId: "i01-l01" });

  // The map now recommends the placed lesson.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});

test("all wrong stops early and places the learner at the start", async ({ page }) => {
  await startTest(page);
  const shown = await answerAll(page, false);
  expect(shown).toBe(7);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start at Unit 1: Basics");
  await expect(page.getByRole("link", { name: "Start from the beginning instead" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start at Unit 1" }).click();
  await expect(page).toHaveURL(/\/lesson\/u01-l01$/);
  const completed = await page.evaluate((p) => JSON.parse(localStorage.getItem(p) ?? "{}").completed ?? {}, PROGRESS_KEY);
  expect(Object.keys(completed)).toHaveLength(0);
});

test("stopping early gives a partial result; the intro links to the test", async ({ page }) => {
  await startTest(page);
  await page.getByRole("button", { name: "I don't know" }).click();
  await page.getByRole("button", { name: "Stop test" }).click();
  await page.getByRole("button", { name: "Stop now" }).click();
  await expect(page.getByText(/based on 1 answer\./)).toBeVisible();

  await page.goto("/welcome");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("I know some already").click();
  await page.getByRole("link", { name: "Take it now" }).click();
  await expect(page).toHaveURL(/\/placement$/);
});
