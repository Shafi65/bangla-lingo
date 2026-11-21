import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The formality trainer (/formality) against the production build.

const KEY = "banglalingo.formality.v1";
const PROGRESS_KEY = "banglalingo.progress.v1";

interface Scenario {
  id: string;
  tier: number;
  options: { bn: string }[];
  answer: number[];
  why: string;
}
const bank = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "..", "content", "formality", "scenarios.json"), "utf8"),
) as { roundSize: number; scenarios: Scenario[] };
const byId = new Map(bank.scenarios.map((s) => [s.id, s]));

async function answerCurrent(page: Page, right: boolean): Promise<Scenario> {
  const q = page.locator("[data-scenario-id]");
  await expect(q).toBeVisible();
  const s = byId.get((await q.getAttribute("data-scenario-id"))!)!;
  const idx = right ? s.answer[0] : s.options.findIndex((_, k) => !s.answer.includes(k));
  await q.locator(`[data-option-index="${idx}"]`).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const fb = page.getByTestId("formality-feedback");
  await expect(fb).toHaveAttribute("data-correct", right ? "true" : "false");
  await expect(fb).toContainText(s.why);
  return s;
}

async function playRound(page: Page, wrongAt: number[] = []) {
  for (let i = 0; i < bank.roundSize; i++) {
    const before = await page.locator("[data-scenario-id]").getAttribute("data-scenario-id");
    await answerCurrent(page, !wrongAt.includes(i));
    const next = page.getByRole("button", { name: i + 1 === bank.roundSize ? "See results" : "Continue" });
    await expect(next).toBeFocused();
    await next.click();
    if (i + 1 < bank.roundSize) await expect(page.locator(`[data-scenario-id="${before}"]`)).toHaveCount(0);
  }
}

test("intro, a perfect round unlocks level 2, and progress stays separate", async ({ page }) => {
  await page.goto("/formality");
  await expect(page.getByRole("heading", { level: 1, name: "Formality trainer" })).toBeVisible();
  await expect(page.getByTestId("formality-intro-card")).toHaveCount(3);
  await expect(page.getByTestId("formality-tier-1")).toHaveAttribute("data-unlocked", "true");
  await expect(page.getByTestId("formality-tier-2")).toHaveAttribute("data-unlocked", "false");
  const progressBefore = await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);

  await page.getByRole("button", { name: "Start" }).click();
  // Level 1 only: every question is a tier-1 scenario.
  const first = await page.locator("[data-scenario-id]").getAttribute("data-scenario-id");
  expect(byId.get(first!)!.tier).toBe(1);
  await playRound(page);

  await expect(page.getByRole("heading", { level: 1, name: "Round complete" })).toBeFocused();
  await expect(page.getByTestId("formality-score")).toHaveText(`${bank.roundSize}/${bank.roundSize}`);
  await expect(page.getByTestId("formality-unlocked")).toContainText("Level 2");

  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!);
  expect(stored).toMatchObject({ v: 1, unlocked: 2, rounds: 1, best: { "1": bank.roundSize } });
  expect(await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY)).toBe(progressBefore);

  await page.getByRole("button", { name: "See the levels" }).click();
  await expect(page.getByTestId("formality-tier-2")).toHaveAttribute("data-unlocked", "true");
  await expect(page.getByTestId("formality-tier-1")).toContainText(`Best ${bank.roundSize}/${bank.roundSize}`);

  // Reload: the unlock persists.
  await page.reload();
  await expect(page.getByTestId("formality-tier-2")).toHaveAttribute("data-unlocked", "true");
});

test("a wrong answer shows the why and is listed in the summary", async ({ page }) => {
  await page.goto("/formality");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await playRound(page, [0, 1, 2]);
  await expect(page.getByTestId("formality-score")).toHaveText(`${bank.roundSize - 3}/${bank.roundSize}`);
  await expect(page.getByTestId("formality-unlocked")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Look at these again" }).getByRole("listitem")).toHaveCount(3);
  const stored = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY))!);
  expect(stored.unlocked).toBe(1);
});

test("fits a 360px phone with 44px targets, and copes with corrupt storage", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.addInitScript((k) => localStorage.setItem(k, "{broken"), KEY);
  await page.goto("/formality");
  await expect(page.getByTestId("formality-tier-1")).toHaveAttribute("data-unlocked", "true");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Start" }).click();
  const opts = page.locator("[data-option-index]");
  await expect(opts.first()).toBeVisible();
  for (const box of await opts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  await answerCurrent(page, true);
  expect(await overflow()).toBeLessThanOrEqual(0);
  const cont = await page.getByRole("button", { name: "Continue" }).boundingBox();
  expect(cont!.height).toBeGreaterThanOrEqual(44);
});
