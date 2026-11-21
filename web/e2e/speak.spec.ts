import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Speaking practice (/speak) against the production build, with Chromium's fake microphone.
// The fake-media flags are set here (not in playwright.config.ts). launchOptions given to test.use()
// replace the project's, so the browser path and --no-sandbox are repeated.
const localChrome = "/usr/bin/google-chrome";
const executablePath = process.env.PW_CHROME_PATH || (fs.existsSync(localChrome) ? localChrome : undefined);
test.use({
  launchOptions: {
    executablePath,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

const SHOTS = "/tmp/feat/speak";
const ONBOARDING_KEY = "banglalingo.onboarding.v1";
const PROGRESS_KEY = "banglalingo.progress.v1";
const SPEAK_KEY = "banglalingo.speak.v1";

const course = JSON.parse(fs.readFileSync("../content/course.json", "utf8")) as {
  units: { id: string; track: string; lessons: string[] }[];
};
const unit1 = course.units.find((u) => u.id === "u01-basics")!;

async function seed(page: Page, withProgress = true) {
  const completed: Record<string, unknown> = {};
  unit1.lessons.forEach((id, i) => {
    completed[id] = { completedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), bestAccuracy: 0.9, timesCompleted: 1 };
  });
  await page.addInitScript(
    ([ob, pk, state, on]) => {
      if (!localStorage.getItem(ob)) localStorage.setItem(ob, JSON.stringify({ version: 1, completed: true, skipped: true }));
      if (on && !localStorage.getItem(pk)) localStorage.setItem(pk, state);
    },
    [
      ONBOARDING_KEY,
      PROGRESS_KEY,
      JSON.stringify({ version: 1, xp: 0, streak: 0, lastActiveDate: null, completed, daily: {} }),
      withProgress,
    ] as const,
  );
}

async function startSession(page: Page) {
  await page.goto("/speak");
  await expect(page.getByRole("heading", { name: "Speaking practice" })).toBeVisible();
  await page.getByTestId("speak-start").click();
  await expect(page.getByTestId("shadow-card")).toBeVisible();
}

/** Records ~1.2 s with the fake microphone and waits for the take to be drawn. */
async function recordTake(page: Page) {
  await page.getByTestId("record").click();
  await expect(page.getByTestId("stop-record")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByTestId("stop-record").click();
  await expect(page.getByTestId("wave-you")).toHaveAttribute("data-status", "ready");
}

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

test("with no progress it explains what to do", async ({ page }) => {
  await seed(page, false);
  await page.goto("/speak");
  await expect(page.getByTestId("speak-empty")).toBeVisible();
  await expect(page.getByTestId("speak-privacy")).toContainText("nothing is uploaded");
});

test("sets: recently learned is the default, then one per completed unit", async ({ page }) => {
  await seed(page);
  await page.goto("/speak");
  const radios = page.getByRole("radio");
  await expect(radios.first()).toBeChecked();
  await expect(page.getByRole("radio", { name: /Recently learned/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Whole unit/ })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/1-sets.png`, fullPage: true });
});

test("record, compare waveforms, rate and move on; nothing is uploaded", async ({ page }) => {
  await seed(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") posts.push(`${r.method()} ${r.url()}`);
  });
  await startSession(page);

  const card = page.getByTestId("shadow-card");
  await expect(card.locator('[lang="bn"]')).toBeVisible();
  await expect(page.getByTestId("wave-native")).toHaveAttribute("data-status", "ready");

  // Slow toggle is a real pressed-state button.
  const slow = page.getByTestId("slow-toggle");
  await slow.click();
  await expect(slow).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("play-native").click();

  await page.getByTestId("record").click();
  await expect(page.getByTestId("stop-record")).toBeVisible();
  await expect(page.getByTestId("speak-status")).toContainText("Recording");
  await page.waitForTimeout(1500);
  await page.getByTestId("stop-record").click();

  await expect(page.getByTestId("wave-you")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("speak-status")).toContainText("Recorded");
  await expect(page.getByTestId("wave-native").locator("svg")).toBeVisible();
  await expect(page.getByTestId("wave-you").locator("svg")).toBeVisible();
  await page.getByTestId("play-you").click();
  await page.screenshot({ path: `${SHOTS}/2-compare.png`, fullPage: true });

  await page.getByTestId("rate-1").click();
  await expect(page.getByTestId("shadow-card").getByText(/Phrase 2 of/)).toBeVisible();
  await expect(page.getByTestId("speak-status")).toContainText("Rated Close");
  // The card for phrase 2 starts clean: the old take is gone.
  await expect(page.getByTestId("wave-you")).toHaveCount(0);

  const stored = await page.evaluate((k) => localStorage.getItem(k), SPEAK_KEY);
  const parsed = JSON.parse(stored!) as { items: Record<string, { last: number; n: number }> };
  expect(Object.values(parsed.items)).toEqual([expect.objectContaining({ last: 1, n: 1 })]);

  // Progress, XP and streak are untouched.
  const progress = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY))!);
  expect(progress.xp).toBe(0);
  expect(progress.streak).toBe(0);
  expect(posts).toEqual([]);
});

test("a rated phrase shows its last rating next time", async ({ page }) => {
  await seed(page);
  await startSession(page);
  const bn = (await page.getByTestId("shadow-card").locator('[lang="bn"]').innerText()).trim();
  await recordTake(page);
  await page.getByTestId("rate-2").click();
  await page.getByTestId("skip").click();
  await page.getByRole("button", { name: "Back to sets" }).click();
  await page.getByTestId("speak-start").click();
  await expect(page.getByTestId("shadow-card").locator('[lang="bn"]')).toHaveText(bn);
  await expect(page.getByTestId("last-rating")).toContainText("Nailed it");
});

test("microphone permission denied is explained and the phrase can be skipped", async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await startSession(page);
  await page.getByTestId("record").click();
  await expect(page.getByTestId("mic-problem")).toContainText(/blocked/i);
  await expect(page.getByTestId("record")).toHaveText(/Try again/);
  await page.screenshot({ path: `${SHOTS}/3-mic-denied.png`, fullPage: true });
  await expect(page.getByTestId("rate-0")).toHaveCount(0);
  await page.getByTestId("skip").click();
  await expect(page.getByTestId("shadow-card").getByText(/Phrase 2 of/)).toBeVisible();
});

test("without MediaRecorder it falls back to listen and self-rate", async ({ page }) => {
  await seed(page);
  await page.addInitScript(() => {
    // @ts-expect-error simulate an old browser
    delete window.MediaRecorder;
  });
  await startSession(page);
  await expect(page.getByTestId("no-recorder")).toBeVisible();
  await expect(page.getByTestId("record")).toHaveCount(0);
  await page.getByTestId("rate-1").click();
  await expect(page.getByTestId("shadow-card").getByText(/Phrase 2 of/)).toBeVisible();
});

test("a failed clip while offline says so", async ({ page, context }) => {
  await seed(page);
  await startSession(page);
  await expect(page.getByTestId("wave-native")).toHaveAttribute("data-status", "ready");
  await page.getByRole("button", { name: "Back to sets" }).click();
  await context.setOffline(true);
  await expect(page.getByTestId("speak-offline")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByTestId("speak-offline")).toHaveCount(0);
});

for (const scheme of ["light", "dark"] as const) {
  test(`fits at 360px in ${scheme} mode with 44px tap targets`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page);
    await startSession(page);
    await page.getByTestId("record").click();
    await page.waitForTimeout(1200);
    await page.getByTestId("stop-record").click();
    await expect(page.getByTestId("wave-you")).toHaveAttribute("data-status", "ready");

    const { sw, iw } = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);

    const small = await page.getByTestId("shadow-card").getByRole("button").evaluateAll((els) =>
      els
        .map((e) => ({ name: e.textContent?.trim(), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
        .filter((b) => b.h < 44 || b.w < 44),
    );
    expect(small).toEqual([]);
    if (scheme === "dark") await page.screenshot({ path: `${SHOTS}/4-dark-360.png`, fullPage: true });
  });
}

test("keyboard: the flow works with Tab and Enter", async ({ page }) => {
  await seed(page);
  await startSession(page);
  await recordTake(page);
  await page.getByTestId("rate-2").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("shadow-card").getByText(/Phrase 2 of/)).toBeVisible();
  // Focus moves to the new phrase heading, not back to the page top.
  await expect(page.locator("#speak-line")).toBeFocused();
});
