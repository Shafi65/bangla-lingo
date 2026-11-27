import { expect, test } from "@playwright/test";

// Letter names (content/script/letter-names.json) under the glyph where letters are taught.
const ONBOARDING_KEY = "banglalingo.onboarding.v1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((k) => {
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ version: 1, completed: true, skipped: true }));
  }, ONBOARDING_KEY);
});

test("script lesson intro names each letter", async ({ page }) => {
  await page.goto("/lesson/s02-l01");
  const names = page.getByTestId("letter-name");
  await expect(names.filter({ hasText: "ক · ko" })).toHaveCount(1);
  await expect(names.filter({ hasText: "উঙ · ungo" })).toHaveCount(1);
  // words in the same list get no name
  await expect(names).toHaveCount(5);
});

test("/write shows the name under the glyph, also at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/write");
  await page.getByTestId("letter-l-sha").click();
  await expect(page.getByTestId("watch-glyph")).toHaveText("শ");
  const name = page.getByTestId("letter-name");
  await expect(name).toContainText("তালব্য শ · talobbo sho");
  const box = (await name.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});

test("/write names a vowel sign", async ({ page }) => {
  await page.goto("/write");
  await page.getByTestId("letter-k-i").click();
  await expect(page.getByTestId("letter-name")).toContainText("ই-কার · i-kar");
});

test("the guide names letters in script units only", async ({ page }) => {
  await page.goto("/guide/s02-consonants");
  await expect(page.getByTestId("letter-name").filter({ hasText: "দন্ত্য স · dontto so" })).toHaveCount(1);
  await page.goto("/guide/u01-basics");
  await expect(page.getByTestId("letter-name")).toHaveCount(0);
});
