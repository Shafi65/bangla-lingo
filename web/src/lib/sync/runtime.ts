"use client";
// Wires the signed-in user to a SyncEngine and exposes its status to the UI. Started by
// components/account/AccountRuntime (mounted in the root layout only when accounts are enabled).
import { useSyncExternalStore } from "react";
import { getSupabase } from "../auth/client";
import { ACCOUNTS_ENABLED } from "../auth/config";
import { deleteAccount, getAuthState, initAuth, onUserChange, signOut, type AuthUser } from "../auth/session";
import { progressStore } from "../progress";
import { emptyStore as emptyFormality } from "../formality/engine";
import { writeStore as writeFormality } from "../formality/storage";
import { replaceWriteProgress } from "../write/storage";
import { replaceSpeakHistory } from "../speak/history";
import { clearStoredPlacement } from "../placement/apply";
import { clearSyncMeta, defaultAdapters } from "./adapters";
import { SyncEngine, type SyncStatus } from "./engine";
import { fetchAllRows, supabaseRemote } from "./remote";

let engine: SyncEngine | null = null;
let engineUser: string | null = null;
let offEngine: (() => void) | null = null;
const IDLE: SyncStatus = Object.freeze({ state: "idle" }) as SyncStatus;
let status: SyncStatus = IDLE;
const listeners = new Set<() => void>();
let started = false;

function setStatus(s: SyncStatus) {
  status = s;
  listeners.forEach((l) => l());
}

async function startFor(user: AuthUser) {
  if (engineUser === user.id && engine) return;
  stopEngine();
  engineUser = user.id;
  const sb = await getSupabase();
  if (engineUser !== user.id) return; // signed out meanwhile
  const e = new SyncEngine({ remote: supabaseRemote(sb, user.id), adapters: defaultAdapters() });
  engine = e;
  offEngine = e.subscribe(() => setStatus(e.getStatus()));
  await e.start();
}

function stopEngine() {
  offEngine?.();
  offEngine = null;
  engine?.stop();
  engine = null;
  engineUser = null;
  setStatus(IDLE);
}

/** Start following auth and syncing. Safe to call more than once. */
export function startAccountRuntime(): void {
  if (!ACCOUNTS_ENABLED || started || typeof window === "undefined") return;
  started = true;
  onUserChange((user) => {
    if (user) void startFor(user).catch(() => undefined);
    else stopEngine();
  });
  initAuth();
  const s = getAuthState();
  if (s.user) void startFor(s.user).catch(() => undefined);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => IDLE,
  );
}

/** "Retry" / "Sync now". */
export function syncNow(): Promise<void> {
  return engine?.syncNow() ?? Promise.resolve();
}

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}

/** Erase what sync covers from this device: progress, word memory and practice features. Settings and the intro answers stay. */
export function clearLocalProgress(): void {
  progressStore.reset();
  writeFormality(emptyFormality());
  replaceWriteProgress({ version: 1, letters: {} });
  replaceSpeakHistory({});
  clearStoredPlacement();
  clearSyncMeta();
}

/** Sign out. Local data stays unless `removeLocal`. A pending push gets a few seconds to finish first. */
export async function signOutOfAccount({ removeLocal = false } = {}): Promise<void> {
  if (engine) await withTimeout(engine.flush().catch(() => undefined), 4000);
  stopEngine();
  await signOut();
  if (removeLocal) clearLocalProgress();
}

/** Delete the account and its server data; optionally this device's progress too. */
export async function deleteAccountAndData({ removeLocal = true } = {}): Promise<void> {
  stopEngine();
  try {
    await deleteAccount();
  } catch (e) {
    // Still signed in: resume syncing.
    const s = getAuthState();
    if (s.user) void startFor(s.user).catch(() => undefined);
    throw e;
  }
  clearSyncMeta();
  if (removeLocal) clearLocalProgress();
}

/** Everything about this learner as one JSON document: this device's copy plus the server rows. */
export async function exportMyData(now = new Date()): Promise<string> {
  const device: Record<string, unknown> = {};
  for (const a of defaultAdapters()) device[a.table] = a.encode(a.read());
  const auth = getAuthState();
  let server: unknown = null;
  let serverError: string | undefined;
  if (auth.user) {
    try {
      server = await fetchAllRows(await getSupabase(), auth.user.id);
    } catch (e) {
      serverError = e instanceof Error ? e.message : String(e);
    }
  }
  return JSON.stringify(
    {
      app: "BanglaLingo",
      exportedAt: now.toISOString(),
      account: auth.user ? { id: auth.user.id, email: auth.user.email } : null,
      device,
      server,
      ...(serverError ? { serverError } : {}),
    },
    null,
    2,
  );
}

/** Save `json` as a file download. */
export function downloadJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
