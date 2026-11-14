import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the production build (`next start`).
//
//   npm run test:e2e                 -> builds, starts the app on :3100, runs the tests
//   E2E_SKIP_BUILD=1 npm run test:e2e -> reuse an existing `.next` build (CI builds first)
//
// Browser selection:
//   PW_CHROME_PATH=/path/to/chrome   -> use that executable
//   (unset) /usr/bin/google-chrome   -> used automatically when present (offline sandboxes)
//   otherwise                        -> Playwright's own Chromium (`npx playwright install chromium`)
const PORT = Number(process.env.E2E_PORT ?? 3100);
const localChrome = "/usr/bin/google-chrome";
const executablePath =
  process.env.PW_CHROME_PATH || (fs.existsSync(localChrome) ? localChrome : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  outputDir: "./node_modules/.cache/playwright-results",
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Deterministic UI: no motion, fixed viewport.
    reducedMotion: "reduce",
    viewport: { width: 900, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 900, height: 900 },
        launchOptions: { executablePath, args: ["--no-sandbox"] },
      },
    },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
