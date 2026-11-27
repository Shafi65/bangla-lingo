import { expect, test } from "@playwright/test";

// Public word pages (/bengali/<slug>). Built without NEXT_PUBLIC_INDEX_WORD_PAGES, so they must stay
// hidden from search engines like the rest of the beta.
const SLUG = "thank-you-dhonnobad";

test("a word page shows the word, how to read it, examples and a lesson link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/bengali/${SLUG}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/“thank you” in Bengali/);
  const word = page.getByRole("region", { name: "The word" });
  await expect(word.getByText("ধন্যবাদ", { exact: true })).toBeVisible();
  await expect(word.getByText("dhonnobad", { exact: true })).toBeVisible();
  await expect(word.getByRole("button", { name: /play audio: ধন্যবাদ/i })).toBeVisible();
  // Conjunct breakdown: ন্য = ন + য, with the jo-fola note.
  await expect(page.getByText(/য-ফলা/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "In a sentence" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start the lesson" })).toHaveAttribute("href", /^\/lesson\/u\d+-l\d+$/);
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=.*dhonnobad/);
  // No sideways scrolling on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "node_modules/.cache/word-page.png", fullPage: true });
});

test("word pages are hidden from search engines during the beta, with canonical and share-card tags", async ({ page, request }) => {
  const res = await page.goto(`/bengali/${SLUG}`);
  // Both signals: search engines obey the header even when the meta tag says otherwise.
  expect(res?.headers()["x-robots-tag"]).toMatch(/noindex/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/bengali/${SLUG}$`));
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toMatch(new RegExp(`/bengali/${SLUG}/opengraph-image`));
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(ld).toMatchObject({ "@type": "DefinedTerm", name: "ধন্যবাদ", inLanguage: "bn" });

  const img = await request.get(new URL(ogImage!).pathname);
  expect(img.ok()).toBe(true);
  expect(img.headers()["content-type"]).toContain("image/png");
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/\s*$/m);
  expect(robots).not.toMatch(/Allow: \/bengali/);
});

test("the index lists words by topic and the dictionary links to word pages", async ({ page }) => {
  await page.goto("/bengali");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Bengali words and phrases/);
  await page.getByRole("link", { name: /ধন্যবাদ/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/bengali/${SLUG}$`));

  await page.goto("/dictionary");
  await page.getByRole("searchbox").fill("dhonnobad");
  await page.getByRole("link", { name: "Word page" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/bengali/${SLUG}$`));
});

test("an unknown word shows the not-found page and is never indexed", async ({ page }) => {
  // Like /guide and /lesson, the status is 200 (the prerendered shell streams first), so the noindex
  // tag is what keeps it out of search results.
  await page.goto("/bengali/not-a-real-word-xyz");
  await expect(page.getByText(/isn.t on the map/i)).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
});
