import { expect, test } from "@playwright/test";

// The Translate tab against the production build. Course results are on-device; the machine layer
// has no key configured in the test server, so it must say so calmly.

test("course lookups as you type, and the machine layer reports it isn't set up", async ({ page }) => {
  await page.goto("/translate");
  await expect(page.getByRole("heading", { name: "Translate", level: 1 })).toBeVisible();
  const box = page.getByRole("textbox", { name: /text to translate/i });

  await box.fill("thank you");
  const course = page.getByRole("region", { name: "From the course" });
  await expect(course.getByText("ধন্যবাদ", { exact: true }).first()).toBeVisible();
  const lesson = course.getByRole("link", { name: /^taught in hello & goodbye$/i }).first();
  await expect(lesson).toHaveAttribute("href", "/guide/u01-basics#u01-l01");

  await box.fill("ami");
  await expect(course.getByText("আমি", { exact: true }).first()).toBeVisible();

  // Bengali script flips the direction.
  await box.fill("কেমন আছেন?");
  await expect(page.getByRole("button", { name: /swap: translate english to bengali/i })).toBeVisible();

  await box.fill("The weather is lovely today");
  await page.getByRole("button", { name: /^translate$/i }).click();
  await expect(page.getByText(/full translation isn.t set up yet/i)).toBeVisible();
  await expect(page.getByText(/machine translation/i).first()).toBeVisible();
});

test("the translate route is POST-only and never cached", async ({ request }) => {
  const res = await request.post("/translate/api", { data: { text: "hi", from: "en", to: "bn" } });
  expect(res.status()).toBe(503);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ ok: false, configured: false });
  expect((await request.get("/translate/api")).status()).toBe(405);
});
