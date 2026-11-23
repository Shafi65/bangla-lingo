import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows, supabaseRemote } from "@/lib/sync/remote";
import { SyncError } from "@/lib/sync/engine";
import { fakeSupabase } from "./helpers/fake-supabase";

const as = (c: unknown) => c as SupabaseClient;

describe("supabaseRemote", () => {
  it("pull selects the user's row and maps it", async () => {
    const sb = fakeSupabase(() => ({ data: { data: { xp: 1 }, rev: "4", schema_version: 1 } }));
    const doc = await supabaseRemote(as(sb), "u1").pull("user_progress");
    expect(doc).toEqual({ data: { xp: 1 }, rev: 4, schemaVersion: 1 });
    expect(sb.chains[0]).toEqual({
      table: "user_progress",
      calls: [["select", "data, rev, schema_version"], ["eq", "user_id", "u1"], ["maybeSingle"]],
    });
  });

  it("pull returns null for no row and throws on errors", async () => {
    expect(await supabaseRemote(as(fakeSupabase()), "u1").pull("user_memory")).toBeNull();
    const bad = fakeSupabase(() => ({ error: { message: "boom" } }));
    await expect(supabaseRemote(as(bad), "u1").pull("user_memory")).rejects.toThrow("boom");
  });

  it("first push inserts rev 1; a unique violation is a conflict", async () => {
    const sb = fakeSupabase();
    expect(await supabaseRemote(as(sb), "u1").push("user_settings", { a: 1 }, 1, null)).toBe("ok");
    expect(sb.chains[0].calls).toEqual([["insert", { user_id: "u1", data: { a: 1 }, schema_version: 1, rev: 1 }]]);
    const dup = fakeSupabase(() => ({ error: { code: "23505", message: "duplicate" } }));
    expect(await supabaseRemote(as(dup), "u1").push("user_settings", {}, 1, null)).toBe("conflict");
  });

  it("later pushes update where rev matches; no row back is a conflict", async () => {
    const sb = fakeSupabase(() => ({ data: [{ rev: 6 }] }));
    expect(await supabaseRemote(as(sb), "u1").push("user_features", { b: 2 }, 1, 5)).toBe("ok");
    expect(sb.chains[0].calls).toEqual([
      ["update", { data: { b: 2 }, schema_version: 1, rev: 6 }],
      ["eq", "user_id", "u1"],
      ["eq", "rev", 5],
      ["select", "rev"],
    ]);
    const stale = fakeSupabase(() => ({ data: [] }));
    expect(await supabaseRemote(as(stale), "u1").push("user_features", {}, 1, 5)).toBe("conflict");
  });

  it("the size check constraint becomes a non-retryable error", async () => {
    const big = fakeSupabase(() => ({ error: { code: "23514", message: "check" } }));
    const err = await supabaseRemote(as(big), "u1").push("user_memory", {}, 1, 2).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect((err as SyncError).retryable).toBe(false);
  });

  it("fetchAllRows reads all four tables", async () => {
    const sb = fakeSupabase((c) => ({ data: { data: { t: c.table } } }));
    const rows = await fetchAllRows(as(sb), "u1");
    expect(Object.keys(rows)).toEqual(["user_progress", "user_memory", "user_settings", "user_features"]);
  });
});
