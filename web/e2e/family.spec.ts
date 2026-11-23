import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// My family (/family) against the production build.

const KEY = "banglalingo.family.v1";
const PROGRESS_KEY = "banglalingo.progress.v1";
const SHOTS = process.env.FAMILY_SHOTS; // folder for screenshots (optional)

const kin = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "content", "family", "kin.json"), "utf8")) as {
  relations: { id: string; terms: Record<string, { ref: { bn: string }; addr: { bn: string }[] }> }[];
};
const term = (id: string, v = "bd") => kin.relations.find((r) => r.id === id)!.terms[v];

async function addRelative(page: Page, group: string, answers: string[], name?: string) {
  await page.getByRole("button", { name: "Add a relative" }).first().click();
  await page.locator(`[data-group="${group}"]`).click();
  for (const a of answers) await page.locator(`[data-answer="${a}"]`).click();
  await expect(page.getByTestId("family-add-preview")).toBeVisible();
  if (name) await page.getByLabel("First name (optional)").fill(name);
  await page.getByRole("button", { name: "Add to my family" }).click();
  await expect(page.getByTestId("family-card")).toBeVisible();
}

test("build a family, read a card, change the variety and override a word", async ({ page }) => {
  await page.goto("/family");
  await expect(page.getByRole("heading", { level: 1, name: "My family" })).toBeVisible();
  const progressBefore = await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);

  // Start: add mother from the empty tree.
  await page.getByRole("button", { name: "Add your mother" }).click();
  await page.getByRole("button", { name: "Add to my family" }).click();
  await expect(page.getByTestId("family-card")).toHaveAttribute("data-rel", "mother");
  await page.getByRole("button", { name: "Back to my family" }).click();

  // Mum's younger sister, named Rina.
  await addRelative(page, "mothers-siblings", ["f", "younger"], "Rina");
  const card = page.getByTestId("family-card");
  await expect(card).toHaveAttribute("data-rel", "mother-younger-sister");
  await expect(page.getByRole("heading", { level: 1, name: "Rina" })).toBeFocused();
  await expect(page.getByTestId("family-ref")).toContainText(term("mother-younger-sister").ref.bn);
  await expect(page.getByTestId("family-addr")).toContainText(term("mother-younger-sister").addr[0].bn);
  await expect(page.getByTestId("family-why")).toContainText("mother's younger sister");
  await expect(page.getByTestId("family-pronoun")).toHaveAttribute("data-pronoun", "apni");
  await expect(page.getByTestId("family-phrase")).toHaveCount(4);
  await expect(page.locator('[data-testid="family-phrase"][data-kind="how"]')).toContainText("আপনি কেমন আছেন?");
  await expect(page.locator('[data-testid="family-phrase"] button[aria-label^="Play audio"]').first()).toBeVisible();

  // Our family uses তুমি with her.
  await page.locator('button[data-pronoun="tumi"]').click();
  await expect(page.getByTestId("family-pronoun")).toHaveAttribute("data-pronoun", "tumi");
  await expect(page.locator('[data-testid="family-phrase"][data-kind="how"]')).toContainText("তুমি কেমন আছো?");

  // Add her child from her card: a cousin, linked to Rina.
  await page.getByRole("button", { name: "Add her child (your cousin)" }).click();
  await expect(page.getByText("Related to Rina (Mum's younger sister)")).toBeVisible();
  await page.locator('[data-answer="m"]').click();
  await page.locator('[data-answer="elder"]').click();
  await page.getByRole("button", { name: "Add to my family" }).click();
  await expect(page.getByTestId("family-card")).toHaveAttribute("data-rel", "cousin-ms-son-elder");
  await expect(page.getByTestId("family-ref")).toContainText("খালাতো ভাই");
  await page.getByRole("button", { name: "Back to my family" }).click();

  // Variety: Hindu families & Kolkata.
  await expect(page.locator('[data-rel="mother-younger-sister"]')).toContainText(term("mother-younger-sister").addr[0].bn);
  await page.getByTestId("family-variety-wb").check();
  await expect(page.locator('[data-rel="mother-younger-sister"]')).toContainText(term("mother-younger-sister", "wb").addr[0].bn);
  await expect(page.locator('[data-rel="cousin-ms-son-elder"]')).toContainText("দাদা");

  // Override: "We call her…" our own word.
  await page.locator('[data-rel="mother-younger-sister"]').click();
  await page.getByTestId("family-custom").fill("Mimi");
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await expect(page.getByTestId("family-addr")).toContainText("Mimi");
  await expect(page.locator('[data-testid="family-phrase"][data-kind="how"]')).toContainText("Mimi, তুমি কেমন আছো?");

  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(stored.variety).toBe("wb");
  expect(stored.people).toHaveLength(3);
  const rina = stored.people.find((p: { rel: string }) => p.rel === "mother-younger-sister");
  expect(rina).toMatchObject({ name: "Rina", pronoun: "tumi", call: { type: "custom", text: "Mimi" } });
  expect(stored.people.find((p: { rel: string }) => p.rel.startsWith("cousin")).linkedTo).toBe(rina.id);
  // Lesson progress is untouched.
  expect(await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY)).toBe(progressBefore);

  // Survives a reload.
  await page.reload();
  await expect(page.locator('[data-rel="mother-younger-sister"]')).toContainText("Mimi");
});

test("practice my family drills the learner's own relatives", async ({ page }) => {
  await page.goto("/family");
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        v: 1,
        people: [
          { id: "p-1", rel: "mother-younger-sister", name: "Rina" },
          { id: "p-2", rel: "father-elder-brother" },
          { id: "p-3", rel: "younger-brother", name: "Sami" },
        ],
        quiz: { rounds: 0, best: 0 },
      }),
    );
  }, KEY);
  await page.reload();
  await page.getByRole("button", { name: "Practice my family" }).click();
  const quiz = page.getByTestId("family-quiz");
  await expect(quiz).toBeVisible();
  let seenRina = false;
  for (let i = 0; ; i++) {
    const prompt = (await page.getByTestId("family-quiz-prompt").textContent())!;
    if (prompt === "What do you call Rina (Mum's younger sister)?") seenRina = true;
    // Answer the first one wrong, the rest right.
    const pick = i === 0 ? quiz.locator("[data-option-index]:not([data-correct])").first() : quiz.locator("[data-option-index][data-correct]").first();
    await pick.click();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByTestId("family-quiz-feedback")).toHaveAttribute("data-correct", i === 0 ? "false" : "true");
    const last = await page.getByRole("button", { name: "See results" }).count();
    const next = page.getByRole("button", { name: last ? "See results" : "Continue" });
    await expect(next).toBeFocused();
    await next.click();
    if (last) break;
  }
  expect(seenRina).toBe(true);
  await expect(page.getByTestId("family-quiz-summary")).toBeVisible();
  await expect(page.getByTestId("family-quiz-score")).toContainText("7 / 8");
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(stored.quiz).toEqual({ rounds: 1, best: 7 });
});

test("works at 360px and in dark mode with 44px targets", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/family");
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        v: 1,
        people: [
          { id: "p-1", rel: "mother" },
          { id: "p-2", rel: "father" },
          { id: "p-3", rel: "mothers-mother" },
          { id: "p-4", rel: "mother-younger-sister", name: "Rina" },
          { id: "p-5", rel: "father-elder-brother", name: "Karim" },
          { id: "p-6", rel: "elder-sister" },
          { id: "p-7", rel: "younger-brother", name: "Sami" },
          { id: "p-8", rel: "cousin-fbe-daughter-younger", linkedTo: "p-5" },
        ],
        quiz: { rounds: 0, best: 0 },
      }),
    );
  }, KEY);
  await page.reload();
  await expect(page.getByTestId("family-person")).toHaveCount(8);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const b of await page.locator("main button:visible").all()) {
    const box = await b.boundingBox();
    if (box) expect(Math.round(box.height)).toBeGreaterThanOrEqual(32); // SpeakButton sm is 32px with a 44px hit area
  }
  for (const b of await page.locator('main [data-testid="family-person"], main .btn').all()) {
    const box = await b.boundingBox();
    if (box) expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "family-tree-390.png"), fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });

  await page.locator('[data-rel="mother-younger-sister"]').click();
  await expect(page.getByTestId("family-card")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 390, height: 844 });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "family-card-390.png"), fullPage: true });

  // Dark mode: the card uses theme tokens (surface is not white).
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const bg = await page.locator(".card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Back to my family" }).click();
  await page.getByRole("button", { name: "Practice my family" }).click();
  await expect(page.getByTestId("family-quiz")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "family-quiz-dark-390.png"), fullPage: true });
});
