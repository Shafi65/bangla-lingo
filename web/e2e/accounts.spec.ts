import fs from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

// Runs against the "accounts" build (dummy Supabase settings, see e2e/servers.mjs). Every request to
// the Supabase host is answered here with page.route: nothing leaves the machine.

const SUPABASE = "https://e2e-project.supabase.co";
const AUTH_KEY = "banglalingo.auth.v1";
const USER = { id: "0b5c1e8e-0000-4000-8000-000000000001", email: "learner@example.test" };
const SHOTS = process.env.ACCOUNTS_SCREENSHOTS; // e.g. /tmp/feat/accounts

const TABLES = ["user_progress", "user_memory", "user_settings", "user_features"] as const;
type Table = (typeof TABLES)[number];

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const access_token = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", exp })}.sig`;
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600 * 24,
    expires_at: exp,
    refresh_token: "refresh-e2e",
    user: { id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "*",
};

/** A tiny in-memory Supabase: auth endpoints, the four tables (with rev checks) and the delete RPC. */
async function mockSupabase(page: Page) {
  const state = {
    rows: new Map<Table, { data: unknown; rev: number; schema_version: number }>(),
    failRest: false,
    otpRequests: [] as unknown[],
    verifyRequests: [] as Record<string, unknown>[],
    deleteCalls: 0,
    unexpected: [] as string[],
  };
  const json = (route: Route, status: number, body?: unknown) =>
    route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });

  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const path = url.pathname;

    if (path === "/auth/v1/otp") {
      state.otpRequests.push(req.postDataJSON());
      return json(route, 200, {});
    }
    if (path === "/auth/v1/verify") {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.verifyRequests.push(body);
      if (body.token === "000000") return json(route, 403, { code: "otp_expired", msg: "Token has expired or is invalid" });
      return json(route, 200, session());
    }
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, headers: CORS });
    if (path === "/auth/v1/user") return json(route, 200, session().user);
    if (path === "/rest/v1/rpc/delete_my_account") {
      state.deleteCalls++;
      state.rows.clear();
      return route.fulfill({ status: 204, headers: CORS });
    }
    const table = path.replace("/rest/v1/", "") as Table;
    if ((TABLES as readonly string[]).includes(table)) {
      if (state.failRest) return json(route, 503, { message: "Service unavailable" });
      const row = state.rows.get(table);
      if (method === "GET") return json(route, 200, row ? [row] : []);
      if (method === "POST") {
        if (row) return json(route, 409, { code: "23505", message: "duplicate key" });
        const body = req.postDataJSON() as { data: unknown; rev: number; schema_version: number };
        state.rows.set(table, { data: body.data, rev: body.rev, schema_version: body.schema_version });
        return json(route, 201);
      }
      if (method === "PATCH") {
        const want = Number(url.searchParams.get("rev")?.replace("eq.", ""));
        if (!row || row.rev !== want) return json(route, 200, []);
        const body = req.postDataJSON() as { data: unknown; rev: number; schema_version: number };
        state.rows.set(table, { data: body.data, rev: body.rev, schema_version: body.schema_version });
        return json(route, 200, [{ rev: body.rev }]);
      }
    }
    state.unexpected.push(`${method} ${path}`);
    return json(route, 404, { message: "not mocked" });
  });
  return state;
}

/** A returning learner: intro done, some lessons played; optionally already signed in. */
async function seed(page: Page, { lessons = 1, signedIn = false } = {}) {
  const completed: Record<string, unknown> = {};
  for (let i = 1; i <= lessons; i++) completed[`u01-l0${i}`] = { completedAt: "2026-11-20T10:00:00.000Z", bestAccuracy: 0.9, timesCompleted: 1 };
  await page.addInitScript(
    ([c, s, key]) => {
      if (sessionStorage.getItem("seeded")) return; // only on the first load of the test
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("banglalingo.onboarding.v1", JSON.stringify({ version: 1, completed: true, skipped: true }));
      localStorage.setItem(
        "banglalingo.progress.v1",
        JSON.stringify({ version: 1, xp: 30, streak: 1, lastActiveDate: "2026-11-20", completed: c, daily: { "2026-11-20": 30 }, settings: {} }),
      );
      if (s) localStorage.setItem(key as string, JSON.stringify(s));
    },
    [completed, signedIn ? session() : null, AUTH_KEY] as const,
  );
}

const account = (page: Page) => page.getByTestId("account-section");
const syncState = (page: Page) => page.getByTestId("sync-status");

test("guest signs in with the emailed code; local and account progress are combined", async ({ page }) => {
  const sb = await mockSupabase(page);
  // The account already has a lesson from another device.
  sb.rows.set("user_progress", {
    data: { xp: 50, streak: 1, lastActiveDate: "2026-11-21", completed: { "u01-l05": { completedAt: "2026-11-21T09:00:00.000Z", bestAccuracy: 1, timesCompleted: 1 } }, daily: { "2026-11-21": 50 } },
    rev: 1,
    schema_version: 1,
  });
  await seed(page, { lessons: 2 });
  if (SHOTS) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");

  await expect(account(page)).toContainText("Optional");
  await account(page).getByRole("button", { name: "Sign in or create an account" }).click();
  const sheet = page.getByTestId("sign-in-sheet");
  await expect(sheet.getByRole("heading", { name: "Save your progress across devices" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Email me a sign-in link" })).toBeDisabled();
  await sheet.getByLabel("Email").fill("learner@example.test");
  await expect(sheet.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-sign-in-sheet.png` });
  await sheet.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(sheet.getByRole("status")).toContainText("We sent a sign-in link to learner@example.test");
  expect(sb.otpRequests[0]).toMatchObject({ email: "learner@example.test", create_user: true });

  // A wrong code shows a friendly error and keeps the sheet open.
  await sheet.getByLabel(/6-digit code/).fill("000000");
  await sheet.getByRole("button", { name: "Sign in" }).click();
  await expect(sheet.getByRole("alert")).toContainText("expired");

  await sheet.getByLabel(/6-digit code/).fill("123456");
  await sheet.getByRole("button", { name: "Sign in" }).click();
  await expect(sheet.getByRole("heading", { name: "You're signed in" })).toBeVisible();
  expect(sb.verifyRequests.at(-1)).toMatchObject({ email: "learner@example.test", token: "123456", type: "email" });
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();

  await expect(account(page)).toContainText("Signed in as learner@example.test");
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");
  await expect(syncState(page)).toContainText("Synced at");

  // Merged both ways: this device got the account's lesson, the account got this device's two.
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem("banglalingo.progress.v1")!));
  expect(Object.keys(local.completed).sort()).toEqual(["u01-l01", "u01-l02", "u01-l05"]);
  expect(local.xp).toBe(50);
  const remote = sb.rows.get("user_progress")!.data as { completed: Record<string, unknown> };
  expect(Object.keys(remote.completed).sort()).toEqual(["u01-l01", "u01-l02", "u01-l05"]);
  expect(sb.rows.size).toBe(4);
  if (SHOTS) {
    await account(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${SHOTS}/2-settings-account-synced.png` });
  }
  expect(sb.unexpected).toEqual([]);
});

test("sync status: error with Retry, then Synced; Offline while the browser is offline", async ({ page, context }) => {
  const sb = await mockSupabase(page);
  sb.failRest = true;
  await seed(page, { signedIn: true });
  await page.goto("/settings");

  await expect(account(page)).toContainText("Signed in as learner@example.test");
  await expect(syncState(page)).toHaveAttribute("data-state", "error");
  await expect(syncState(page)).toContainText("Couldn't sync");
  // Local progress is untouched by the failure.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("banglalingo.progress.v1")!).xp)).toBe(30);

  sb.failRest = false;
  await syncState(page).getByRole("button", { name: "Retry" }).click();
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");
  expect(sb.rows.get("user_progress")).toBeTruthy();

  await context.setOffline(true);
  await syncState(page).getByRole("button", { name: "Sync now" }).click();
  await expect(syncState(page)).toHaveAttribute("data-state", "offline");
  await expect(syncState(page)).toContainText("Offline");
  await context.setOffline(false);
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");
});

test("a change syncs in the background after a short pause", async ({ page }) => {
  const sb = await mockSupabase(page);
  await seed(page, { signedIn: true });
  await page.goto("/settings");
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");
  await page.getByText("50 XP", { exact: true }).click();
  await expect
    .poll(() => (sb.rows.get("user_settings")?.data as { settings?: { dailyGoal?: number } } | undefined)?.settings?.dailyGoal, { timeout: 15_000 })
    .toBe(50);
});

test("delete account needs the typed confirmation and removes the account", async ({ page }) => {
  const sb = await mockSupabase(page);
  await seed(page, { signedIn: true });
  if (SHOTS) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");

  await account(page).getByRole("button", { name: "Delete my account and data" }).click();
  const dialog = page.getByTestId("delete-account");
  const del = dialog.getByRole("button", { name: "Delete account" });
  await expect(del).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(del).toBeDisabled();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(del).toBeEnabled();
  await expect(dialog.getByLabel("Also remove progress from this device")).toBeChecked();
  if (SHOTS) {
    await dialog.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${SHOTS}/3-delete-confirmation.png` });
  }
  // "Keep my account" backs out.
  await dialog.getByRole("button", { name: "Keep my account" }).click();
  await expect(dialog).toBeHidden();
  expect(sb.deleteCalls).toBe(0);

  await account(page).getByRole("button", { name: "Delete my account and data" }).click();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(account(page)).toContainText("Your account and its data were deleted.");
  await expect(account(page).getByRole("button", { name: "Sign in or create an account" })).toBeVisible();
  expect(sb.deleteCalls).toBe(1);
  const left = await page.evaluate((k) => ({ auth: localStorage.getItem(k), progress: JSON.parse(localStorage.getItem("banglalingo.progress.v1")!) }), AUTH_KEY);
  expect(left.auth).toBeNull();
  expect(left.progress.xp).toBe(0);
});

test("sign out keeps this device's progress by default", async ({ page }) => {
  await mockSupabase(page);
  await seed(page, { signedIn: true });
  await page.goto("/settings");
  await expect(syncState(page)).toHaveAttribute("data-state", "synced");
  await account(page).getByRole("button", { name: "Sign out" }).click();
  await expect(account(page).getByLabel("Also remove progress from this device")).not.toBeChecked();
  await account(page).getByRole("group", { name: "Sign out" }).getByRole("button", { name: "Sign out" }).click();
  await expect(account(page)).toContainText("Signed out. Your progress is still on this device.");
  const xp = await page.evaluate(() => JSON.parse(localStorage.getItem("banglalingo.progress.v1")!).xp);
  expect(xp).toBe(30);
});

test("an emailed sign-in link (token_hash) finishes on the callback page", async ({ page }) => {
  const sb = await mockSupabase(page);
  await seed(page);
  // As built by the recommended template: {{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email
  await page.goto("/auth/callback?next=%2Fprofile#token_hash=hash-from-email&type=email");
  await expect(page).toHaveURL((u) => u.pathname === "/profile");
  expect(sb.verifyRequests.at(-1)).toMatchObject({ token_hash: "hash-from-email", type: "email" });
  await expect(page.getByTestId("profile-account")).toContainText("learner@example.test");
  expect(page.url()).not.toContain("hash-from-email");
});

test("a sign-in link that fell back to the Site URL is forwarded to the callback page", async ({ page }) => {
  const sb = await mockSupabase(page);
  await seed(page);
  await page.goto("/#token_hash=fallback-hash&type=email");
  await expect.poll(() => sb.verifyRequests.length).toBe(1);
  expect(sb.verifyRequests[0]).toMatchObject({ token_hash: "fallback-hash", type: "email" });
  await expect(page).toHaveURL((u) => u.pathname === "/settings" && !u.href.includes("fallback-hash"));
});

test("after a few lessons a guest sees one dismissible prompt on the map", async ({ page }) => {
  await mockSupabase(page);
  await seed(page, { lessons: 3 });
  await page.goto("/");
  const prompt = page.getByTestId("save-prompt");
  await expect(prompt).toContainText("Save your progress across devices");
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(prompt).toBeHidden();
  await page.reload();
  await expect(page.getByRole("link", { name: /BanglaLingo home/ })).toBeVisible();
  await expect(page.getByTestId("save-prompt")).toHaveCount(0);
});

test.beforeAll(() => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
