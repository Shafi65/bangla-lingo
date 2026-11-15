import { expect, test } from "@playwright/test";

const PROGRESS_KEY = "banglalingo.progress.v1";
const ONBOARDING_KEY = "banglalingo.onboarding.v1";

test("a fresh browser gets the intro, picks a 20 XP goal and lands on the map", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);

  // 1. Welcome
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bengali");
  await expect(page.getByText("আসসালামু আলাইকুম")).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();

  // 2. Why
  await expect(page.getByRole("heading", { name: /what brings you/i })).toBeFocused();
  await page.getByRole("radiogroup").getByText("Family", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Where to start (Continue is locked until a choice is made); Back keeps working
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("radio", { name: /family/i })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("I'm new to Bengali").click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Pace
  await page.getByText("50 XP", { exact: true }).click();
  await page.getByText("20 XP", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /20 XP/ })).toBeChecked();
  await page.getByText("Hide it", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Done
  await expect(page.getByRole("heading", { name: /all set/i })).toBeVisible();
  await page.getByRole("link", { name: "Go to the map" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /start the first lesson/i })).toBeVisible();

  const stored = await page.evaluate(
    ([p, o]) => ({
      progress: JSON.parse(localStorage.getItem(p) ?? "{}"),
      onboarding: JSON.parse(localStorage.getItem(o) ?? "{}"),
    }),
    [PROGRESS_KEY, ONBOARDING_KEY],
  );
  expect(stored.progress.settings.dailyGoal).toBe(20);
  expect(stored.progress.settings.translit).toBe("hidden");
  expect(stored.onboarding).toMatchObject({ completed: true, skipped: false, reason: "family", level: "new" });

  // And it does not come back.
  await page.reload();
  await expect(page.getByRole("link", { name: /start the first lesson/i })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("skipping the intro goes to the map and is remembered", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByRole("button", { name: "Skip intro" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: /start the first lesson/i })).toBeVisible();
  const flag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), ONBOARDING_KEY);
  expect(flag).toMatchObject({ completed: true, skipped: true });
});

test("a learner with existing progress goes straight to the map", async ({ page }) => {
  await page.addInitScript(
    ([key]) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          xp: 40,
          streak: 1,
          lastActiveDate: "2026-01-01",
          completed: { "u01-l01": { completedAt: "2026-01-01T10:00:00.000Z", bestAccuracy: 1, timesCompleted: 1 } },
          daily: { "2026-01-01": 40 },
          settings: {},
        }),
      );
    },
    [PROGRESS_KEY],
  );
  await page.goto("/");
  await expect(page.getByRole("link", { name: /continue/i }).first()).toBeVisible();
  await page.waitForTimeout(800); // a (wrong) redirect would have fired by now
  await expect(page).toHaveURL(/\/$/);
});
