// Supabase-backed Remote for the sync engine. One row per user per table (see supabase/migrations).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncTable } from "./adapters";
import { SyncError, type PushResult, type Remote, type RemoteDoc } from "./engine";

/** Postgres unique violation: the row was inserted by another device first. */
const UNIQUE_VIOLATION = "23505";
/** Check constraint violation: the size cap in the migration. */
const CHECK_VIOLATION = "23514";

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(table: SyncTable): Promise<RemoteDoc | null> {
      const { data, error } = await client
        .from(table)
        .select("data, rev, schema_version")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { data: data.data, rev: Number(data.rev), schemaVersion: Number(data.schema_version) };
    },

    async push(table: SyncTable, doc: unknown, schemaVersion: number, prevRev: number | null): Promise<PushResult> {
      if (prevRev === null) {
        const { error } = await client.from(table).insert({ user_id: userId, data: doc, schema_version: schemaVersion, rev: 1 });
        if (!error) return "ok";
        if (error.code === UNIQUE_VIOLATION) return "conflict";
        if (error.code === CHECK_VIOLATION) throw new SyncError("Your saved data is too large to sync.", false);
        throw new Error(error.message);
      }
      const { data, error } = await client
        .from(table)
        .update({ data: doc, schema_version: schemaVersion, rev: prevRev + 1 })
        .eq("user_id", userId)
        .eq("rev", prevRev)
        .select("rev");
      if (error) {
        if (error.code === CHECK_VIOLATION) throw new SyncError("Your saved data is too large to sync.", false);
        throw new Error(error.message);
      }
      return data && data.length > 0 ? "ok" : "conflict";
    },
  };
}

/** The signed-in user's server rows, for "Download my data". */
export async function fetchAllRows(client: SupabaseClient, userId: string): Promise<Record<SyncTable, unknown>> {
  const tables: SyncTable[] = ["user_progress", "user_memory", "user_settings", "user_features"];
  const out = {} as Record<SyncTable, unknown>;
  for (const t of tables) {
    const { data, error } = await client.from(t).select("data, schema_version, rev, updated_at").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    out[t] = data ?? null;
  }
  return out;
}
