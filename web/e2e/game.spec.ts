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

// ---------------------------------------------------------------- round 2

const today = () => dayKey(new Date());
const done = () => ({ completedAt: new Date().toISOString(), bestAccuracy: 1, timesCompleted: 1 });
const game = (over: Record<string, unknown> = {}) => ({ v: 1, coinsEarned: 0, coinsSpent: 0, freezesEarned: 0, freezesUsed: 0, lastFreeFreezeDay: null, today: null, stats: {}, notice: null, ...over });

test("committing to a streak goal shows the goal on the streak card", async ({ page }) => {
  await seed(page, { [PROGRESS_KEY]: { version: 1, xp: 30, streak: 2, lastActiveDate: today(), completed: {}, daily: { [today()]: 15, [daysAgo(1)]: 15 }, settings: {} } });
  await page.goto("/");
  const card = page.locator("section:visible", { has: page.getByRole("heading", { name: "2-day streak" }) });
  await card.getByRole("button", { name: /7 days/ }).click();
  await expect(card.getByText("Goal: 7 days")).toBeVisible();
  await expect(card.getByRole("progressbar", { name: /2 of 7 days/ })).toBeVisible();
  expect((await read(page, GAME_KEY)).goal.target).toBe(7);
});

test("the shop sells a review boost and a lamp", async ({ page }) => {
  await seed(page, { [GAME_KEY]: game({ coinsEarned: 150 }) });
  await page.goto("/shop");
  const boost = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Review boost" }) });
  await boost.getByRole("button", { name: /buy/i }).click();
  await expect(boost.getByText(/Running: \d+ min left/)).toBeVisible();
  const lamp = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "River lamp" }) });
  await lamp.getByRole("button", { name: /buy/i }).click();
  await expect(lamp.getByRole("button", { name: "Back to marigold" })).toBeVisible();
  const g = await read(page, GAME_KEY);
  expect(g.lamp).toBe("lamp-river");
  expect(g.spent).toEqual({ boost: 40, "lamp-river": 80 });
});

test("a speed round deals five pairs and scores a match", async ({ page }) => {
  await seed(page, { [PROGRESS_KEY]: { version: 1, xp: 45, streak: 1, lastActiveDate: today(), completed: { "u01-l01": done(), "u01-l02": done(), "u01-l03": done() }, daily: {}, settings: {} } });
  await page.goto("/speed");
  await page.getByRole("button", { name: "Go!" }).click();
  const bn = page.getByRole("list", { name: "Bengali words" }).getByRole("button");
  const en = page.getByRole("list", { name: "Meanings" }).getByRole("button");
  await expect(bn).toHaveCount(5);
  await expect(en).toHaveCount(5);
  await expect(page.getByRole("timer")).toBeVisible();
  // Try the first Bengali word against each meaning until one matches (a miss just resets the combo).
  const score = page.locator("main span.tabular-nums").first();
  for (let j = 0; j < 5; j++) {
    await bn.first().click();
    await en.nth(j).click();
    if ((await score.textContent()) !== "0") break;
  }
  await expect(score).toHaveText("10");
});

test("the letter sky offers a review of flickering letters", async ({ page }) => {
  const past = Date.now() - 86_400_000;
  await seed(page, {
    [PROGRESS_KEY]: { version: 1, xp: 15, streak: 1, lastActiveDate: today(), completed: { "s01-l01": done() }, daily: {}, settings: {} },
    "banglalingo.memory.v1": { version: 1, words: { "l-o": { id: "l-o", reps: 2, lapses: 0, stability: 1, difficulty: 5, due: past, lastSeen: past - 86_400_000, run: 1 } }, pending: [] },
  });
  await page.goto("/stars");
  await page.getByRole("button", { name: /light the sky \(1 flickering\)/i }).click();
  await expect(page.getByRole("button", { name: /^check$/i })).toBeVisible();
});
