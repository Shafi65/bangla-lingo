// @vitest-environment jsdom
// With NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY unset (the default for tests and e2e), accounts are off:
// no account UI, supabase-js is never loaded and nothing touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const loaded = vi.hoisted(() => ({ supabase: false }));
vi.mock("@supabase/supabase-js", () => {
  loaded.supabase = true;
  return { createClient: () => { throw new Error("must not be created"); } };
});

const fetchSpy = vi.fn(async () => new Response("{}"));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubGlobal("fetch", fetchSpy);
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("accounts disabled", () => {
  it("the flag is off without both env vars", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const { ACCOUNTS_ENABLED } = await import("@/lib/auth/config");
    expect(ACCOUNTS_ENABLED).toBe(false);
  });

  it("runtime, auth and sync calls are no-ops with no network and no supabase-js", async () => {
    vi.resetModules();
    const runtime = await import("@/lib/sync/runtime");
    const session = await import("@/lib/auth/session");
    const { progressStore } = await import("@/lib/progress");
    runtime.startAccountRuntime();
    session.initAuth();
    expect(session.getAuthState().status).toBe("disabled");
    progressStore.completeLesson("u01-l01", 10, 1);
    await runtime.syncNow();
    await session.signOut();
    await vi.waitFor(() => undefined);
    expect(runtime.getSyncStatus().state).toBe("idle");
    await expect((await import("@/lib/auth/client")).getSupabase()).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loaded.supabase).toBe(false);
  });

  it("renders no account UI", async () => {
    vi.resetModules();
    const { AccountSection } = await import("@/components/account/AccountSection");
    const { SavePrompt } = await import("@/components/account/SavePrompt");
    const { ProfileAccountCard } = await import("@/components/account/ProfileAccountCard");
    const { AccountRuntime } = await import("@/components/account/AccountRuntime");
    for (const C of [AccountSection, SavePrompt, ProfileAccountCard, AccountRuntime]) {
      expect(renderToString(createElement(C))).toBe("");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loaded.supabase).toBe(false);
  });
});
