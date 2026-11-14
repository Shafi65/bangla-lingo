// Starts one of the two production servers the e2e suite needs (see playwright.config.ts):
//
//   node e2e/servers.mjs main      real course content          -> :E2E_PORT      (default 3100), build in .next
//   node e2e/servers.mjs fixture   built-in demo fixture lesson -> :E2E_PORT + 1,                   build in .next-fixture
//
// The fixture build points CONTENT_DIR at a folder that does not exist, so the loader falls back to
// src/fixtures (see src/lib/content.ts). It waits for the main server before building, so two
// `next build`s never run at the same time. E2E_SKIP_BUILD=1 reuses existing builds.
import { spawn, spawnSync } from "node:child_process";

const which = process.argv[2];
const mainPort = Number(process.env.E2E_PORT ?? 3100);
const fixture = which === "fixture";
const port = fixture ? mainPort + 1 : mainPort;
const env = fixture
  ? { ...process.env, CONTENT_DIR: "/nonexistent/bangla-lingo-e2e-fixture", NEXT_DIST_DIR: ".next-fixture" }
  : process.env;

if (fixture) {
  for (let i = 0; i < 600; i++) {
    try {
      await fetch(`http://localhost:${mainPort}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
if (!process.env.E2E_SKIP_BUILD) {
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const child = spawn("npx", ["next", "start", "-p", String(port)], { stdio: "inherit", env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
