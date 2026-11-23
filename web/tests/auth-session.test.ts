// @vitest-environment jsdom
// Auth flows with accounts enabled, against a mocked supabase-js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./helpers/fake-supabase";

const holder = vi.hoisted(() => ({ client: null as unknown, created: 0, options: null as unknown }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    holder.created++;
    holder.options = options;
    return holder.client;
  },
}));

let sb: ReturnType<typeof fakeSupabase>;

async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
  return {
    session: await import("@/lib/auth/session"),
    config: await import("@/lib/auth/config"),
    runtime: await import("@/lib/sync/runtime"),
    progress: await import("@/lib/progress"),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  sb = fakeSupabase();
  holder.client = sb;
  holder.created = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("auth session", () => {
  it("a guest with no stored session never creates the client", async () => {
    const { session, config } = await load();
    expect(config.ACCOUNTS_ENABLED).toBe(true);
    session.initAuth();
    expect(session.getAuthState().status).toBe("signed-out");
    expect(holder.created).toBe(0);
  });

  it("uses localStorage, PKCE and no URL detection", async () => {
    const { session } = await load();
    await session.sendEmailLink(" learner@example.test ", "/profile");
    expect(holder.options).toMatchObject({
      db: { retry: false },
      auth: { storageKey: "banglalingo.auth.v1", persistSession: true, detectSessionInUrl: false, flowType: "pkce" },
    });
    expect(sb.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "learner@example.test",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fprofile", shouldCreateUser: true },
    });
  });

  it("verifies the 6-digit code and becomes signed in", async () => {
    const { session } = await load();
    await session.verifyEmailCode("learner@example.test", "123456");
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ email: "learner@example.test", token: "123456", type: "email" });
    expect(session.getAuthState()).toEqual({ status: "signed-in", user: { id: "user-1", email: "learner@example.test" } });
  });

  it("completes sign-in from a token_hash link and from an OAuth code", async () => {
    const { session } = await load();
    expect(await session.completeSignInFromUrl(new URL("http://localhost/auth/callback?token_hash=h&type=email&next=/profile"))).toBe("/profile");
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "email" });
    await session.completeSignInFromUrl(new URL("http://localhost/auth/callback?code=c"));
    expect(sb.auth.exchangeCodeForSession).toHaveBeenCalledWith("c");
  });

  it("maps errors to friendly messages", async () => {
    const { session } = await load();
    sb.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: "Token has expired or is invalid" } } as never);
    await expect(session.verifyEmailCode("a@b.co", "000000")).rejects.toThrow(/expired/);
    await expect(session.completeSignInFromUrl(new URL("http://localhost/auth/callback?error_description=Bad+thing"))).rejects.toThrow("Bad thing");
  });

  it("OAuth goes through the callback URL", async () => {
    const { session, config } = await load();
    expect(config.OAUTH_PROVIDERS).toEqual([]);
    await session.signInWithProvider("google");
    expect(sb.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "http://localhost:3000/auth/callback" } });
  });

  it("sign out keeps local progress by default; the option removes it", async () => {
    const { session, runtime, progress } = await load();
    await session.verifyEmailCode("a@b.co", "123456");
    progress.progressStore.completeLesson("u01-l01", 10, 1);
    window.localStorage.setItem("banglalingo.auth.v1", "{}");
    await runtime.signOutOfAccount();
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(window.localStorage.getItem("banglalingo.auth.v1")).toBeNull();
    expect(session.getAuthState().status).toBe("signed-out");
    expect(progress.progressStore.get().xp).toBe(10);

    await session.verifyEmailCode("a@b.co", "123456");
    await runtime.signOutOfAccount({ removeLocal: true });
    expect(progress.progressStore.get().xp).toBe(0);
  });

  it("delete calls delete_my_account() and signs out; a failure keeps the session", async () => {
    const { session, runtime } = await load();
    await session.verifyEmailCode("a@b.co", "123456");
    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: "nope" } });
    await expect(runtime.deleteAccountAndData()).rejects.toThrow("nope");
    expect(session.getAuthState().status).toBe("signed-in");
    await runtime.deleteAccountAndData();
    expect(sb.rpc).toHaveBeenLastCalledWith("delete_my_account");
    expect(session.getAuthState().status).toBe("signed-out");
  });

  it("starting with a stored session follows auth events and starts sync for the user", async () => {
    window.localStorage.setItem("banglalingo.auth.v1", "{}");
    sb.auth.getSession.mockResolvedValue({ data: { session: sb.session("u9", "x@y.z") } });
    const { session, runtime } = await load();
    runtime.startAccountRuntime();
    await vi.waitFor(() => expect(session.getAuthState().status).toBe("signed-in"));
    await vi.waitFor(() => expect(sb.from).toHaveBeenCalledWith("user_progress"));
    expect(session.getAuthState().user?.id).toBe("u9");
    // A sign-out from another tab arrives as an auth event.
    sb.emit("SIGNED_OUT", null);
    await vi.waitFor(() => expect(session.getAuthState().status).toBe("signed-out"));
    expect(runtime.getSyncStatus().state).toBe("idle");
  });

  it("exports device data and server rows as JSON", async () => {
    const { session, runtime, progress } = await load();
    await session.verifyEmailCode("a@b.co", "123456");
    progress.progressStore.completeLesson("u01-l01", 10, 1);
    const json = JSON.parse(await runtime.exportMyData(new Date("2026-03-01T00:00:00Z")));
    expect(json).toMatchObject({ app: "BanglaLingo", exportedAt: "2026-03-01T00:00:00.000Z", account: { id: "user-1", email: "learner@example.test" } });
    expect(json.device.user_progress.xp).toBe(10);
    expect(Object.keys(json.server)).toEqual(["user_progress", "user_memory", "user_settings", "user_features"]);
  });
});
