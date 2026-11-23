import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Game layer: quests and wallet on the map, streak freezes, the bazaar and the letter sky.

const GAME_KEY = "banglalingo.game.v1";
const PROGRESS_KEY = "banglalingo.progress.v1";
const bank = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "content", "bazaar", "stalls.json"), "utf8")) as {
  stalls: { id: string; title: string; steps: ({ kind: "listen"; choices: string[]; answer: number } | { kind: "choose"; options: { bn: string }[]; answer: number })[] }[];
};

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

async function seed(page: Page, values: Record<string, unknown>) {
  await page.addInitScript((v) => {
    if (sessionStorage.getItem("e2e-seeded")) return;
    sessionStorage.setItem("e2e-seeded", "1");
    localStorage.setItem("banglalingo.onboarding.v1", JSON.stringify({ version: 1, completed: true, skipped: true }));
    for (const [k, x] of Object.entries(v)) localStorage.setItem(k, JSON.stringify(x));
  }, values);
}

const read = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);

test("daily quests and the wallet appear on the map", async ({ page }) => {
  await seed(page, {});
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Daily quests" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /0 taka coins/ }).first()).toBeAttached();
  const game = await read(page, GAME_KEY);
  expect(game.today.quests).toHaveLength(3);
});

test("held streak freezes cover missed days and keep the streak", async ({ page }) => {
  await seed(page, {
    [PROGRESS_KEY]: { version: 1, xp: 60, streak: 5, lastActiveDate: daysAgo(2), completed: {}, daily: { [daysAgo(2)]: 20 }, settings: {} },
    [GAME_KEY]: { v: 1, coinsEarned: 0, coinsSpent: 0, freezesEarned: 1, freezesUsed: 0, lastFreeFreezeDay: null, today: null, stats: {}, notice: null },
  });
  await page.goto("/");
  await expect(page.getByText(/streak freeze covered the day you missed/i)).toBeVisible();
  await expect(page.getByRole("img", { name: /5-day streak/ })).toBeVisible();
  const p = await read(page, PROGRESS_KEY);
  expect(p.frozen).toEqual([daysAgo(1)]);
  expect((await read(page, GAME_KEY)).freezesUsed).toBe(1);
});

test("a bazaar stall: ask, catch the price, haggle, get coins and a quest step", async ({ page }) => {
  await seed(page, {});
  await page.goto("/bazaar");
  const stall = bank.stalls[0];
  await page.getByRole("button", { name: new RegExp(stall.title) }).click();
  for (const st of stall.steps) {
    const label = st.kind === "listen" ? st.choices[st.answer] : st.options[st.answer].bn;
    await page.getByRole("button").filter({ has: page.getByText(label, { exact: true }) }).first().click();
    await expect(page.getByRole("status").filter({ hasText: /nicely said/i })).toBeVisible();
    await page.getByRole("button", { name: /continue|pay and finish/i }).click();
  }
  await expect(page.getByRole("heading", { name: /a great deal/i })).toBeVisible();
  const game = await read(page, GAME_KEY);
  expect(game.coinsEarned).toBeGreaterThan(0);
  expect(game.stats.bazaarRounds).toBe(1);
});

test("the letter sky lights a star for a finished script lesson", async ({ page }) => {
  await seed(page, {
    [PROGRESS_KEY]: { version: 1, xp: 15, streak: 1, lastActiveDate: dayKey(new Date()), completed: { "s01-l01": { completedAt: new Date().toISOString(), bestAccuracy: 1, timesCompleted: 1 } }, daily: {}, settings: {} },
  });
  await page.goto("/stars");
  await expect(page.getByRole("heading", { name: "The letter sky" })).toBeVisible();
  await expect(page.getByRole("button", { name: /met in a lesson/ }).first()).toBeVisible();
  await expect(page.getByText(/of \d+ stars lit/)).not.toHaveText(/^0 of/);
});
