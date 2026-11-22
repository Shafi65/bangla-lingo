import { expect, test, type Page } from "@playwright/test";

// The Translate tab against the production build. Course results are on-device. The test server
// has no Azure key, so the machine layer must say so calmly; the few tests that need a working
// translator answer /translate/api themselves with page.route (no network, no key).

const box = (page: Page) => page.getByRole("textbox", { name: /text to translate/i });
const direction = (page: Page, re: RegExp) => page.getByRole("button", { name: re });

test("course lookups as you type, and the machine layer reports it isn't set up", async ({ page }) => {
  await page.goto("/translate");
  await expect(page.getByRole("heading", { name: "Translate", level: 1 })).toBeVisible();

  await box(page).fill("thank you");
  const course = page.getByRole("region", { name: "From the course" });
  await expect(course.getByText("ধন্যবাদ", { exact: true }).first()).toBeVisible();
  const lesson = course.getByRole("link", { name: /^taught in hello & goodbye$/i }).first();
  await expect(lesson).toHaveAttribute("href", "/guide/u01-basics#u01-l01");

  await box(page).fill("ami");
  await expect(course.getByText("আমি", { exact: true }).first()).toBeVisible();

  // Bengali script flips the direction.
  await box(page).fill("কেমন আছেন?");
  await expect(direction(page, /direction: bengali to english/i)).toBeVisible();

  await box(page).fill("The weather is lovely today");
  await expect(direction(page, /direction: english to bengali/i)).toBeVisible();
  await page.getByRole("button", { name: /^translate$/i }).click();
  await expect(page.getByText(/machine translation isn.t set up yet/i)).toBeVisible();
});

test("Enter in the box translates", async ({ page }) => {
  await page.goto("/translate");
  await box(page).fill("The weather is lovely today");
  await box(page).press("Enter");
  await expect(page.getByText(/machine translation isn.t set up yet/i)).toBeVisible();
});

test("a typo gets a 'Did you mean' that finds the course word", async ({ page }) => {
  await page.goto("/translate");
  await box(page).fill("thnak you");
  const sec = page.getByRole("region", { name: "Not in the course yet" });
  await expect(sec.getByText("Did you mean…?")).toBeVisible();
  await sec.getByRole("button", { name: "thank you" }).click();
  await expect(box(page)).toHaveValue("thank you");
  await expect(page.getByRole("region", { name: "From the course" }).getByText("ধন্যবাদ", { exact: true }).first()).toBeVisible();
});

test("Bengali endings and English plurals find the base word, with a note", async ({ page }) => {
  await page.goto("/translate");
  await box(page).fill("ভাতটা");
  const course = page.getByRole("region", { name: "From the course" });
  await expect(page.getByTestId("course-note")).toContainText("ভাতটা → ভাত + -টা 'the'");
  await expect(course.getByText("ভাত", { exact: true }).first()).toBeVisible();

  await box(page).fill("teachers");
  await expect(page.getByTestId("course-note")).toContainText("teachers → teacher");
  await expect(course.getByText("শিক্ষক", { exact: true }).first()).toBeVisible();
});

test("with nothing found and no translator, the empty state says why", async ({ page }) => {
  await page.goto("/translate");
  await box(page).fill("qzxvkw");
  const sec = page.getByRole("region", { name: "Not in the course yet" });
  await expect(sec).toBeVisible();
  await expect(sec.getByText(/isn.t set up on this site yet/i)).toBeVisible();
});

test("romanized Bengali is detected, read as Bengali script, and can be switched to English", async ({ page }) => {
  let calls = 0;
  let sent: unknown;
  await page.route("**/translate/api", async (route) => {
    calls++;
    sent = route.request().postDataJSON();
    await route.fulfill({
      json: { ok: true, text: "I eat rice", from: "bn", to: "en", read: "আমি ভাত খাই" },
    });
  });
  await page.goto("/translate");
  await box(page).fill("ami bhat khai");
  await expect(direction(page, /direction: romanized bengali to english/i)).toBeVisible();
  await page.getByRole("button", { name: /^translate$/i }).click();

  const card = page.getByRole("region", { name: "Machine translation" });
  await expect(card.getByText("Read as:")).toBeVisible();
  await expect(card.getByText("আমি ভাত খাই")).toBeVisible();
  await expect(card.getByText("I eat rice", { exact: true })).toBeVisible();
  expect(sent).toEqual({ text: "ami bhat khai", from: "bn", to: "en", romanized: true });

  // The same text a second time comes from this device's cache: no second request.
  await box(page).fill("ami bhat khai ");
  await page.getByRole("button", { name: /^translate$/i }).click();
  await expect(card.getByText("Saved on this device")).toBeVisible();
  expect(calls).toBe(1);

  // Override the guess.
  await page.getByRole("button", { name: "It's English", exact: true }).first().click();
  await expect(direction(page, /direction: english to bengali/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /read as romanized bengali/i })).toBeVisible();
});

test("English input is not mistaken for romanized Bengali", async ({ page }) => {
  await page.goto("/translate");
  for (const t of ["bad", "pain", "where is the market", "thank you"]) {
    await box(page).fill(t);
    await expect(direction(page, /direction: english to bengali/i)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "It's English", exact: true })).toHaveCount(0);
});

test("machine Bengali gets a romanization: course words as taught, the rest marked approximate", async ({ page }) => {
  await page.route("**/translate/api", (route) =>
    route.fulfill({
      json: { ok: true, text: "আমি ভাত অচেনাশব্দ", from: "en", to: "bn", roman: ["ami", "bhat", "ochenashobdo"] },
    }),
  );
  await page.goto("/translate");
  await box(page).fill("I rice strangeword");
  await page.getByRole("button", { name: /^translate$/i }).click();
  const card = page.getByRole("region", { name: "Machine translation" });
  await expect(card.getByText("ami bhat ochenashobdo")).toBeVisible();
  await expect(card.getByText("approximate romanization")).toBeVisible();
});

test("the free allowance message is shown as is", async ({ page }) => {
  await page.route("**/translate/api", (route) =>
    route.fulfill({
      status: 503,
      json: { ok: false, quota: true, error: "The free translation allowance is used up for this month; course words still work." },
    }),
  );
  await page.goto("/translate");
  await box(page).fill("The weather is lovely today");
  await page.getByRole("button", { name: /^translate$/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /allowance/ })).toHaveText(/allowance is used up for this month; course words still work/i);
});

test("the translate route is POST-only, never cached, and has a keyless health check", async ({ request }) => {
  const res = await request.post("/translate/api", { data: { text: "hi", from: "en", to: "bn" } });
  expect(res.status()).toBe(503);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ ok: false, configured: false });
  expect((await request.get("/translate/api")).status()).toBe(405);

  const health = await request.get("/translate/api?health=1");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ configured: false });
  expect(health.headers()["cache-control"]).toContain("no-store");
  expect(health.headers()["x-robots-tag"]).toMatch(/noindex/);
});

test.describe("small screen, dark mode", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("no sideways scroll; the controls are at least 44px", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/translate");
    await box(page).fill("ami bhat khai");
    await expect(direction(page, /direction: romanized bengali to english/i)).toBeVisible();
    for (const [name, loc] of [
      ["direction", direction(page, /direction:/i)],
      ["It's English", page.getByRole("button", { name: "It's English", exact: true })],
      ["Translate", page.getByRole("button", { name: /^translate$/i })],
    ] as const) {
      const b = await loc.boundingBox();
      expect(b, name).not.toBeNull();
      expect(b!.height, `${name} height`).toBeGreaterThanOrEqual(43.5);
      expect(b!.width, `${name} width`).toBeGreaterThanOrEqual(43.5);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
