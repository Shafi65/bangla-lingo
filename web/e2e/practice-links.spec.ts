import { expect, test, type Page } from "@playwright/test";

// The "More practice" links on /practice lead to the extra practice pages.

const links = [
  { link: "Speaking practice", heading: "Speaking practice", url: /\/speak$/ },
  { link: "Formality trainer", heading: "Formality trainer", url: /\/formality$/ },
  { link: "Write the letters", heading: "Write the letters", url: /\/write$/ },
  { link: "Stories", heading: "Stories", url: /\/stories$/ },
  { link: "My family", heading: "My family", url: /\/family$/ },
];

for (const l of links) {
  test(`practice hub link: ${l.link}`, async ({ page }) => {
    await page.goto("/practice");
    const section = page.getByRole("region", { name: "More practice" });
    const a = section.getByRole("link", { name: l.link });
    await expect(a).toBeVisible();
    const box = await a.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await a.click();
    await expect(page).toHaveURL(l.url);
    await expect(page.getByRole("heading", { name: l.heading }).first()).toBeVisible();
  });
}

// Course map: the unit "Story" link points at the list until the unit's first lesson is done,
// then at the story itself. U1 has no story; "My family" sits in the family unit header.

async function seedDone(page: Page, ids: string[]) {
  await page.addInitScript(
    ([done]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("banglalingo.onboarding.v1", JSON.stringify({ version: 1, completed: true, skipped: true }));
      const c: Record<string, unknown> = {};
      for (const id of done as string[]) c[id] = { completedAt: "2026-11-20T10:00:00.000Z", bestAccuracy: 0.9, timesCompleted: 1 };
      localStorage.setItem(
        "banglalingo.progress.v1",
        JSON.stringify({ version: 1, xp: 40, streak: 1, lastActiveDate: "2026-11-20", completed: c, daily: { "2026-11-20": 40 }, settings: {} }),
      );
    },
    [ids] as const,
  );
}

async function openAllSections(page: Page) {
  // Each click turns that button into "Hide", so always click the first remaining "Show".
  const show = page.getByRole("button", { name: "Show", exact: true });
  while ((await show.count()) > 0) await show.first().click();
}

test("course map: unit story link follows the first lesson", async ({ page }) => {
  await seedDone(page, ["u01-l01"]);
  await page.goto("/");
  await openAllSections(page);
  const u2 = page.locator('section[aria-labelledby="unit-u02-pronouns"]');
  await expect(u2.getByRole("link", { name: /^Story/ })).toHaveAttribute("href", "/stories");
  await expect(page.locator('section[aria-labelledby="unit-u01-basics"]').getByRole("link", { name: /^Story/ })).toHaveCount(0);
  await expect(
    page.locator('section[aria-labelledby="unit-u03-family"]').getByRole("link", { name: "My family", exact: true }),
  ).toHaveAttribute("href", "/family");
});

test("course map: story link opens the story once the first lesson is done", async ({ page }) => {
  await seedDone(page, ["u01-l01", "u02-l01", "u15-l01"]);
  await page.goto("/");
  await openAllSections(page);
  const link = page.locator('section[aria-labelledby="unit-u02-pronouns"]').getByRole("link", { name: /^Story/ });
  await expect(link).toHaveAttribute("href", "/stories/u02-pronouns-story");
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.locator('section[aria-labelledby="unit-u15-describing"]').getByRole("link", { name: /^Story/ }),
  ).toHaveAttribute("href", "/stories/u15-describing-story");
});
