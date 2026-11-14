import { expect, test, type Page } from "@playwright/test";

// Plays the built-in demo fixture lesson (src/fixtures/units/demo-basics/demo-l01.json), whose first
// four exercises are the sentence-level types: fill_blank (choose), fill_blank (typed), listen_meaning
// and reading. It runs against a second server built with a CONTENT_DIR that does not exist, so the
// loader falls back to the fixture (see e2e/servers.mjs). Options are shuffled in the UI, so answers
// are picked by visible text.

async function start(page: Page) {
  await page.goto("/lesson/demo-l01");
  await page.getByRole("button", { name: /start lesson/i }).click();
  await expect(page.getByRole("progressbar", { name: /lesson progress/i })).toBeVisible();
}
const check = (page: Page) => page.getByRole("button", { name: /^check$/i }).click();
const next = (page: Page) => page.getByRole("button", { name: /^continue$/i }).click();
const options = (page: Page) => page.getByRole("group", { name: /answer options/i });

test("fill_blank, listen_meaning and reading play through the lesson player", async ({ page }) => {
  await start(page);
  const status = page.getByRole("status");
  const hearts = page.getByRole("img", { name: /hearts left/i });
  const heartsBefore = await hearts.getAttribute("aria-label");

  // ---- fill_blank, choose
  await expect(page.getByRole("heading", { name: /fill in the blank/i })).toBeVisible();
  const sentence = page.locator("main p[lang='bn']").first();
  await expect(sentence).toContainText("ভালো আছি।");
  await expect(sentence.getByRole("img", { name: "blank" })).toBeVisible(); // a visible gap
  await expect(page.getByText("“I am fine.”")).toBeVisible(); // the English cue
  // the transliteration is masked: it must not reveal the blank ("ami") before checking
  await expect(page.getByText("___ bhalo achhi")).toBeVisible();
  await expect(page.getByText("ami bhalo achhi")).toHaveCount(0);
  await expect(page.locator("main").getByText("ami", { exact: true })).toHaveCount(1); // only the option's own transliteration
  // a wrong answer first: the feedback shows the full sentence with audio and costs a heart
  await options(page).getByRole("button", { name: /তুমি/ }).click();
  await check(page);
  await expect(status).toContainText(/not quite/i);
  await expect(status).toContainText("আমি ভালো আছি।");
  await expect(status).toContainText("ami bhalo achhi");
  await expect(status.getByRole("button", { name: /play audio/i })).toBeVisible();
  expect(await hearts.getAttribute("aria-label")).not.toBe(heartsBefore);
  await next(page);

  // ---- fill_blank, typed: Enter checks, a transliteration variant is accepted
  await expect(page.getByRole("heading", { name: /type the missing word/i })).toBeVisible();
  await expect(page.getByText("na, ___")).toBeVisible();
  const input = page.getByRole("textbox", { name: /your answer/i });
  await input.fill("Dhonnobaad");
  await input.press("Enter");
  await expect(status).toBeVisible();
  await expect(status).not.toContainText(/not quite/i);
  await next(page);

  // ---- listen_meaning: play + slower, Bengali hidden until checked, number keys pick
  await expect(page.getByRole("heading", { name: /what does it mean/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /play (audio|slowly)|no bengali voice/i }).first()).toBeVisible();
  await expect(page.locator("main").getByText("আমি ভালো আছি।")).toHaveCount(0);
  await expect(page.locator("main").getByText("ami bhalo achhi")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(options(page).getByRole("button", { pressed: true })).toHaveCount(1);
  await check(page);
  await expect(status).toBeVisible();
  await expect(status).toContainText("আমি ভালো আছি।"); // revealed after checking
  await next(page);

  // ---- reading: bubbles, translations hidden until tapped, play all
  await expect(page.getByRole("heading", { name: /read, then answer/i })).toBeVisible();
  await expect(page.getByText("A quick hello")).toBeVisible();
  await expect(page.getByText("tumi bhalo achho?")).toBeVisible(); // transliteration follows the display setting
  await expect(page.getByText("Are you well?")).toHaveCount(0);
  const toggles = page.getByRole("button", { name: /show translation/i });
  await expect(toggles).toHaveCount(3);
  await toggles.first().click();
  await expect(page.getByText("Are you well?")).toBeVisible();
  await expect(page.getByRole("button", { name: /play all/i })).toBeVisible();
  await options(page).getByRole("button", { name: /Rina/ }).click();
  await check(page);
  await expect(status).not.toContainText(/not quite/i);
  await next(page);
});

test("a wrong reading answer costs a heart and shows the correct answer", async ({ page }) => {
  await start(page);
  // answer the first three exercises, then fail the reading one
  await options(page).getByRole("button", { name: /আমি/ }).first().click();
  await check(page);
  await next(page);
  await page.getByRole("textbox", { name: /your answer/i }).fill("dhonnobad");
  await page.keyboard.press("Enter");
  await next(page);
  await page.keyboard.press("1");
  await check(page);
  await next(page);

  await expect(page.getByRole("heading", { name: /read, then answer/i })).toBeVisible();
  const hearts = page.getByRole("img", { name: /hearts left/i });
  const before = Number(/(\d+) of/.exec((await hearts.getAttribute("aria-label")) ?? "")?.[1]);
  await options(page).getByRole("button", { name: /Neither/ }).click();
  await check(page);
  const status = page.getByRole("status");
  await expect(status).toContainText(/not quite/i);
  await expect(status).toContainText(/the answer is/i);
  await expect(status).toContainText("Rina");
  expect(Number(/(\d+) of/.exec((await hearts.getAttribute("aria-label")) ?? "")?.[1])).toBeLessThan(before);
  await next(page);
  // the missed question comes back at the end
  await expect(page.getByRole("heading", { name: /lesson complete/i })).toHaveCount(0);
});
