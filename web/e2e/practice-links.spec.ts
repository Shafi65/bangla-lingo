import { expect, test } from "@playwright/test";

// The "More practice" links on /practice lead to the three extra practice pages.

const links = [
  { link: "Speaking practice", heading: "Speaking practice", url: /\/speak$/ },
  { link: "Formality trainer", heading: "Formality trainer", url: /\/formality$/ },
  { link: "Write the letters", heading: "Write the letters", url: /\/write$/ },
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
