import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { CSV_COLUMNS, parseCsv } from "../src/lib/reviewer/export";

// Reviewer mode (/reviewer): a native-speaker reviewer marks lesson items and exports the result.

const LESSON_ID = "u01-l01";
const lesson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "..", "content", "units", "u01-basics", `${LESSON_ID}.json`), "utf8"),
) as { title: string; exercises: { id: string }[]; vocab: { id: string; bn: string }[] };
const [first, second] = lesson.exercises;

test.beforeEach(async ({ page }) => {
  await page.goto("/reviewer");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function openLesson(page: Page) {
  await page.getByRole("link", { name: new RegExp(`${LESSON_ID}`) }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(lesson.title) })).toBeVisible();
}

test("the reviewer is not indexed and not linked from the app", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/");
  await expect(page.locator('a[href^="/reviewer"]')).toHaveCount(0);
});

test("review two exercises, export the CSV and check its rows", async ({ page }) => {
  await page.getByRole("textbox", { name: "Your name" }).fill("Rina, Ahmed");
  await openLesson(page);

  // Static cards: options with the correct one marked, no quiz.
  const a = page.getByRole("article", { name: `Exercise ${first.id}` });
  await expect(a.getByText("Correct", { exact: true })).toHaveCount(1);
  await expect(a.getByRole("button", { name: "OK", exact: true })).toBeVisible();

  await a.getByRole("button", { name: "OK", exact: true }).click();
  await expect(a.getByRole("button", { name: "OK", exact: true })).toHaveAttribute("aria-pressed", "true");

  const b = page.getByRole("article", { name: `Exercise ${second.id}` });
  await b.getByRole("button", { name: "Needs change" }).click();
  const fix = 'ভালো, "ঠিক" আছে';
  await b.getByLabel(`Suggested correction for exercise ${second.id}`).fill(fix);
  await b.getByLabel(`Comment on exercise ${second.id}`).fill("line one\nline two, with comma");

  // Overall rating
  await page.getByRole("radio", { name: "4 out of 5" }).click();
  await page.getByLabel("Overall comment on this lesson").fill("মোটামুটি স্বাভাবিক");

  // Saved locally under one key, and survives a reload.
  await page.reload();
  await expect(page.getByRole("article", { name: `Exercise ${first.id}` }).getByRole("button", { name: "OK", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(`Suggested correction for exercise ${second.id}`)).toHaveValue(fix);

  await page.getByRole("button", { name: /Export \/ Import/ }).click();
  await expect(page.getByRole("button", { name: /Download CSV \(3 rows\)/ })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download CSV/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^banglalingo-review-rina-ahmed-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = fs.readFileSync((await download.path())!, "utf8");
  expect(text.startsWith("﻿")).toBe(true);

  const rows = parseCsv(text);
  expect(rows[0]).toEqual([...CSV_COLUMNS]);
  const rec = (r: string[]) => Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, r[i]]));
  const byId = Object.fromEntries(rows.slice(1).map((r) => [rec(r).exerciseId, rec(r)]));
  expect(Object.keys(byId).sort()).toEqual(["lesson", first.id, second.id].sort());
  expect(byId[first.id]).toMatchObject({ reviewer: "Rina, Ahmed", lessonId: LESSON_ID, verdict: "ok", correction: "", comment: "" });
  expect(byId[first.id].bengali).not.toBe("");
  expect(byId[second.id]).toMatchObject({
    lessonId: LESSON_ID,
    verdict: "needs_change",
    correction: fix,
    comment: "line one\nline two, with comma",
  });
  expect(byId[second.id].date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(byId.lesson).toMatchObject({ verdict: "rating:4", comment: "মোটামুটি স্বাভাবিক" });
});

test("keyboard shortcuts, progress and the index filters", async ({ page }) => {
  await openLesson(page);
  await page.keyboard.press("j"); // first item (tip or first vocab row)
  await page.keyboard.press("1");
  await expect(page.getByText(/^1 \/ \d+ reviewed$/)).toBeVisible();
  // Jump to exercise 1 through the strip, then J moves on and 3 marks Unsure.
  await page.getByRole("button", { name: `Go to ${first.id}` }).click();
  await page.keyboard.press("j");
  await page.keyboard.press("3");
  const b = page.getByRole("article", { name: `Exercise ${second.id}` });
  await expect(b.getByRole("button", { name: "Unsure" })).toHaveAttribute("aria-pressed", "true");

  // Typing in a comment box must not trigger shortcuts.
  await b.getByLabel(`Comment on exercise ${second.id}`).fill("j k 1 2 3");
  await expect(b.getByRole("button", { name: "Unsure" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/reviewer");
  await page.getByRole("button", { name: /^Flagged/ }).click();
  await expect(page.getByRole("link", { name: new RegExp(LESSON_ID) })).toBeVisible();
  await expect(page.getByRole("link", { name: /u01-l02/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Done/ }).click();
  await expect(page.getByText("No lessons match this filter.")).toBeVisible();
  await page.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("link", { name: /Open next unreviewed/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reviewer/${LESSON_ID}$`));
});

test("a changed exercise shows as changed since your review", async ({ page }) => {
  await openLesson(page);
  const a = page.getByRole("article", { name: `Exercise ${first.id}` });
  await a.getByRole("button", { name: "OK", exact: true }).click();
  // Simulate an edit to the exercise by changing the stored hash.
  await page.evaluate((id) => {
    const k = "banglalingo.reviewer.v1";
    const s = JSON.parse(localStorage.getItem(k)!);
    for (const l of Object.values<{ items: Record<string, { hash: string }> }>(s.lessons)) l.items[id].hash = "old";
    localStorage.setItem(k, JSON.stringify(s));
  }, first.id);
  await page.reload();
  const again = page.getByRole("article", { name: `Exercise ${first.id}` });
  await expect(again.getByText(/Changed since your review \(was: OK\)/)).toBeVisible();
  await expect(again.getByRole("button", { name: "OK", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("import restores a JSON export on another device", async ({ page }) => {
  await page.getByRole("textbox", { name: "Your name" }).fill("Karim");
  await openLesson(page);
  await page.getByRole("article", { name: `Exercise ${first.id}` }).getByRole("button", { name: "Needs change" }).click();
  await page.getByRole("button", { name: /Export \/ Import/ }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON" }).click()]);
  const file = (await download.path())!;

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /Export \/ Import/ }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("Imported 1 entry");
  await expect(page.getByRole("textbox", { name: "Your name" })).toHaveValue("Karim");
});
