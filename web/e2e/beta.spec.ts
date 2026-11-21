import { expect, test } from "@playwright/test";

// Private-beta basics against the production build: indexing blocked, security headers, privacy page.

test("robots.txt blocks everything and pages say noindex", async ({ request, page }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/User-Agent: \*\s+Disallow: \//i);
  const res = await page.goto("/");
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/reviewer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("security headers are set", async ({ request }) => {
  const h = (await request.get("/privacy")).headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("microphone=(self)");
  expect(h["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
});

test("privacy page is linked from the welcome screen and settings, with one draft notice", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.getByText(/no analytics, no tracking and no cookies/i)).toBeVisible();
  await expect(page.getByText(/public GitHub issue/i)).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText(/Draft course: lessons are not yet checked by a native speaker/)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Privacy" }).first()).toHaveAttribute("href", "/privacy");

  await page.goto("/");
  await expect(page.getByText(/Draft course: lessons are not yet checked/)).toHaveCount(1);
});
