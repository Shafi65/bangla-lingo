import { expect, test, type Page } from "@playwright/test";

// Phone layout guard: key pages must not scroll sideways at 360px, in light or dark, and the shared
// header controls must keep 44px tap targets. Uses the real-course server (project "chromium").

test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });

const ONBOARDING_KEY = "banglalingo.onboarding.v1";
const PAGES = [
  "/",
  "/practice",
  "/words",
  "/guide",
  "/guide/u01-basics",
  "/dictionary",
  "/translate",
  "/profile",
  "/settings",
  "/welcome",
  "/placement",
  "/offline",
  "/reviewer",
  "/lesson/u01-l01",
];

async function noSidewaysScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.scrollingElement!.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw).toBeLessThanOrEqual(iw);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((k) => {
        if (!localStorage.getItem(k)) {
          localStorage.setItem(k, JSON.stringify({ version: 1, completed: true, skipped: true }));
        }
      }, ONBOARDING_KEY);
    });

    for (const path of PAGES) {
      test(`${path} has no horizontal overflow at 360px`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await noSidewaysScroll(page);
      });
    }

    test("a lesson exercise and its feedback fit at 360px", async ({ page }) => {
      await page.goto("/lesson/u01-l01");
      await page.getByRole("button", { name: /start lesson/i }).click();
      await expect(page.getByRole("progressbar", { name: /lesson progress/i })).toBeVisible();
      await noSidewaysScroll(page);
      await page.keyboard.press("1");
      await page.getByRole("button", { name: /^check$/i }).click();
      await expect(page.getByRole("status")).toBeVisible();
      await noSidewaysScroll(page);
    });
  });
}

test("header controls are at least 44px tall and wide", async ({ page }) => {
  await page.addInitScript((k) => {
    localStorage.setItem(k, JSON.stringify({ version: 1, completed: true, skipped: true }));
  }, ONBOARDING_KEY);
  await page.goto("/translate");
  for (const name of ["BanglaLingo home", "Daily goal settings", "Profile", "Settings"]) {
    const box = await page.locator("header").getByRole("link", { name, exact: true }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
  }
});
