import { expect, test, type Page } from "@playwright/test";

const ONBOARDING_KEY = "banglalingo.onboarding.v1";
const WRITE_KEY = "banglalingo.write.v1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((k) => {
    if (!localStorage.getItem(k)) {
      localStorage.setItem(k, JSON.stringify({ version: 1, completed: true, skipped: true }));
    }
  }, ONBOARDING_KEY);
});

/** Horizontal runs of ink in the visible guide canvas, in CSS pixels relative to the ink canvas. */
async function guideRuns(page: Page) {
  return page.evaluate(() => {
    const g = document.querySelector<HTMLCanvasElement>('[data-testid="guide-canvas"]')!;
    const ink = document.querySelector<HTMLCanvasElement>('[data-testid="ink-canvas"]')!;
    const rect = ink.getBoundingClientRect();
    const ctx = g.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, g.width, g.height);
    const k = rect.width / g.width;
    const step = Math.max(2, Math.round(g.height * 0.03));
    const runs: { x0: number; x1: number; y: number }[] = [];
    for (let y = 0; y < g.height; y += step) {
      let start = -1;
      for (let x = 0; x <= g.width; x++) {
        const on = x < g.width && data[(y * g.width + x) * 4 + 3] > 40;
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          runs.push({ x0: rect.left + start * k, x1: rect.left + (x - 1) * k, y: rect.top + y * k });
          start = -1;
        }
      }
    }
    return runs;
  });
}

async function traceGlyph(page: Page) {
  const runs = await guideRuns(page);
  expect(runs.length).toBeGreaterThan(5);
  for (const r of runs) {
    await page.mouse.move(r.x0, r.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(r.x0 + ((r.x1 - r.x0) * i) / 4, r.y);
    await page.mouse.up();
  }
}

async function openLetter(page: Page, id: string) {
  await page.goto("/write");
  await page.getByTestId(`letter-${id}`).click();
  await expect(page.getByTestId("write-panel")).toBeVisible();
}

test("letter grid lists the script-track letters, all not started", async ({ page }) => {
  await page.goto("/write");
  await expect(page.getByRole("heading", { name: "Write the letters" })).toBeVisible();
  await expect(page.getByTestId("letter-l-o")).toHaveAttribute("data-state", "new");
  await expect(page.getByTestId("letter-l-ka")).toBeVisible();
  await expect(page.getByTestId("letter-k-aa")).toBeVisible();
  await expect(page.getByTestId("write-summary")).toContainText("0 of");
});

test("watch, trace along the letter, pass, and remember it", async ({ page }) => {
  await openLetter(page, "l-ka");
  await expect(page.getByTestId("watch-glyph")).toHaveText("ক");
  await expect(page.getByText("top line last", { exact: false })).toBeVisible();
  await expect(page.getByText("Stroke-order guidance", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Start tracing" }).click();
  const ink = page.getByTestId("ink-canvas");
  await expect(ink).toHaveCSS("touch-action", "none");
  // Check is disabled until something is drawn.
  await expect(page.getByRole("button", { name: "Check my tracing" })).toBeDisabled();

  await traceGlyph(page);
  await page.getByRole("button", { name: "Check my tracing" }).click();
  const result = page.getByTestId("write-result");
  await expect(result).toContainText("Well traced");
  await expect(result.locator("p")).toHaveAttribute("data-passed", "true");

  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), WRITE_KEY);
  expect(stored.letters["l-ka"]).toBe("traced");

  await page.getByRole("button", { name: "Write it from memory" }).click();
  await expect(page.getByRole("button", { name: "Check my writing" })).toBeDisabled();

  // Back on the grid the tile shows the new state.
  await page.getByRole("button", { name: "All letters" }).click();
  await expect(page.getByTestId("letter-l-ka")).toHaveAttribute("data-state", "traced");
  await page.reload();
  await expect(page.getByTestId("letter-l-ka")).toHaveAttribute("data-state", "traced");
});

test("a scribble fails and undo / clear work", async ({ page }) => {
  await openLetter(page, "l-ka");
  await page.getByRole("button", { name: "Start tracing" }).click();
  const box = (await page.getByTestId("ink-canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(
      box.x + box.width * (0.1 + 0.8 * ((i * 37) % 11) / 10),
      box.y + box.height * (0.1 + 0.8 * ((i * 53) % 7) / 6),
    );
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Check my tracing" }).click();
  await expect(page.getByTestId("write-result").locator("p")).toHaveAttribute("data-passed", "false");
  await expect(page.getByTestId("write-result")).toContainText("Not quite");

  await page.getByRole("button", { name: "Undo stroke" }).click();
  await expect(page.getByTestId("write-result").locator("p")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear" })).toBeDisabled();

  // Pressing Check with a blank canvas is not possible; the grid is unchanged.
  await page.getByRole("button", { name: "All letters" }).click();
  await expect(page.getByTestId("letter-l-ka")).toHaveAttribute("data-state", "new");
});

test("keyboard users can skip tracing and move between letters", async ({ page }) => {
  await openLetter(page, "l-o");
  await page.getByRole("button", { name: "Skip tracing" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Check my writing" })).toBeVisible();
  await expect(page.getByTestId("guide-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Next letter" }).first().click();
  await expect(page.getByTestId("watch-glyph")).toHaveText("আ");
  await page.getByRole("button", { name: "Previous letter" }).click();
  await expect(page.getByTestId("watch-glyph")).toHaveText("অ");
});

test("writing from memory over the same letter scores and shows the guide", async ({ page }) => {
  await openLetter(page, "l-ka");
  await page.getByRole("button", { name: "Skip tracing" }).click();
  // No guide is drawn before checking.
  const blank = await page.evaluate(() => {
    const g = document.querySelector<HTMLCanvasElement>('[data-testid="guide-canvas"]')!;
    return !g.getContext("2d")!.getImageData(0, 0, g.width, g.height).data.some((v) => v !== 0);
  });
  expect(blank).toBe(true);
  // Use the (hidden) guide runs from a throwaway trace-step render: go to the trace step to read them.
  await page.getByRole("button", { name: "Back to tracing" }).click();
  const runs = await guideRuns(page);
  await page.getByRole("button", { name: "Skip tracing" }).click();
  for (const r of runs) {
    await page.mouse.move(r.x0, r.y);
    await page.mouse.down();
    await page.mouse.move(r.x1, r.y, { steps: 4 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Check my writing" }).click();
  await expect(page.getByTestId("write-result")).toContainText("Well remembered");
  await expect(page.getByRole("button", { name: "Next letter" }).first()).toBeEnabled();
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), WRITE_KEY);
  expect(stored.letters["l-ka"]).toBe("written");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true });
  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme}: fits 360px and the canvas is square`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openLetter(page, "l-ka");
      await page.getByRole("button", { name: "Start tracing" }).click();
      const box = (await page.getByTestId("ink-canvas").boundingBox())!;
      expect(Math.abs(box.width - box.height)).toBeLessThan(1.5);
      expect(box.width).toBeLessThanOrEqual(360);
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.scrollingElement!.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(sw).toBeLessThanOrEqual(iw);
      for (const name of ["Undo stroke", "Clear", "Skip tracing", "Previous letter"]) {
        const b = (await page.getByRole("button", { name }).first().boundingBox())!;
        expect(b.height, name).toBeGreaterThanOrEqual(43.5);
      }
    });
  }
});
