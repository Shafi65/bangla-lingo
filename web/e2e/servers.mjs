// Starts one of the two production servers the e2e suite needs (see playwright.config.ts):
//
//   node e2e/servers.mjs main      real course content          -> :E2E_PORT      (default 3100), build in .next
//   node e2e/servers.mjs fixture   built-in demo fixture lesson -> :E2E_PORT + 1,                   build in .next-fixture
//   node e2e/servers.mjs accounts  real course, accounts ON      -> :E2E_PORT + 2,                   build in .next-accounts
//
// The accounts build sets dummy Supabase env vars (the host is never contacted: e2e/accounts.spec.ts
// answers every request to it with page.route). The other two builds have accounts off.
//
// The fixture build points CONTENT_DIR at a folder that does not exist, so the loader falls back to
// src/fixtures (see src/lib/content.ts). It waits for the main server before building, so two
// `next build`s never run at the same time (the accounts build waits for the fixture server).
// E2E_SKIP_BUILD=1 reuses existing builds.
import { spawn, spawnSync } from "node:child_process";

const which = process.argv[2];
const mainPort = Number(process.env.E2E_PORT ?? 3100);
const fixture = which === "fixture";
const accounts = which === "accounts";
const E2E_SUPABASE_URL = "https://e2e-project.supabase.co";
const port = fixture ? mainPort + 1 : accounts ? mainPort + 2 : mainPort;
// Builds of the default suite never see Supabase settings, even if the shell has them.
const baseEnv = { ...process.env };
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_AUTH_PROVIDERS"]) delete baseEnv[k];
const env = fixture
  ? { ...baseEnv, CONTENT_DIR: "/nonexistent/bangla-lingo-e2e-fixture", NEXT_DIST_DIR: ".next-fixture" }
  : accounts
    ? {
        ...baseEnv,
        NEXT_DIST_DIR: ".next-accounts",
        NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-public-anon-key",
      }
    : baseEnv;

if (fixture || accounts) {
  const waitFor = fixture ? mainPort : mainPort + 1;
  for (let i = 0; i < 900; i++) {
    try {
      await fetch(`http://localhost:${waitFor}/`);
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
