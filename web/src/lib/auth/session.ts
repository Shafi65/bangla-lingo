"use client";
// Account state in the browser: who is signed in, and the sign-in / sign-out / delete actions.
// Sign-in is always optional; every function here is a no-op (or rejects) when accounts are off.
import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasStoredSession, hasSupabase } from "./client";
import { ACCOUNTS_ENABLED, AUTH_STORAGE_KEY, CALLBACK_PATH, type OAuthProvider } from "./config";
import { parseCallback } from "./redirect";

export type AuthStatus = "disabled" | "loading" | "signed-out" | "signed-in";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const DISABLED: AuthState = Object.freeze({ status: "disabled", user: null }) as AuthState;
const LOADING: AuthState = Object.freeze({ status: "loading", user: null }) as AuthState;
const SIGNED_OUT: AuthState = Object.freeze({ status: "signed-out", user: null }) as AuthState;

let state: AuthState = ACCOUNTS_ENABLED ? LOADING : DISABLED;
const listeners = new Set<() => void>();
const userListeners = new Set<(user: AuthUser | null) => void>();
let initialized = false;
let listening = false;

function set(next: AuthState) {
  const prevId = state.user?.id ?? null;
  if (next.status === state.status && (next.user?.id ?? null) === prevId && next.user?.email === state.user?.email) return;
  state = next;
  listeners.forEach((l) => l());
  if ((next.user?.id ?? null) !== prevId) userListeners.forEach((l) => l(next.user));
}

function fromSession(s: Session | null): AuthState {
  if (!s?.user) return SIGNED_OUT;
  return { status: "signed-in", user: { id: s.user.id, email: s.user.email ?? null } };
}

/** Attach to the Supabase client (creating it) and follow its auth events. */
async function listen(): Promise<void> {
  if (listening) return;
  listening = true;
  const sb = await getSupabase();
  sb.auth.onAuthStateChange((_event, session) => {
    // Don't call other Supabase methods inside this callback (it holds the auth lock): defer.
    setTimeout(() => set(fromSession(session)), 0);
  });
  const { data } = await sb.auth.getSession();
  set(fromSession(data.session));
}

/**
 * Called once on page load (AccountRuntime). With no stored session the client is not even
 * loaded: the learner is a guest and nothing touches the network.
 */
export function initAuth(): void {
  if (!ACCOUNTS_ENABLED || initialized || typeof window === "undefined") return;
  initialized = true;
  if (hasStoredSession()) {
    void listen().catch(() => set(SIGNED_OUT));
  } else {
    set(SIGNED_OUT);
  }
  // Another tab signed in or out.
  window.addEventListener("storage", (e) => {
    if (e.key !== AUTH_STORAGE_KEY && e.key !== null) return;
    if (hasSupabase() || hasStoredSession()) void listen().catch(() => undefined);
  });
}

export function getAuthState(): AuthState {
  return state;
}

export function subscribeAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Fires when the signed-in user changes (sign-in, sign-out, a different account). */
export function onUserChange(cb: (user: AuthUser | null) => void): () => void {
  userListeners.add(cb);
  return () => userListeners.delete(cb);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, () => (ACCOUNTS_ENABLED ? LOADING : DISABLED));
}

function callbackUrl(next?: string): string {
  const u = new URL(CALLBACK_PATH, window.location.origin);
  if (next) u.searchParams.set("next", next);
  return u.toString();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send the sign-in email (a link plus a 6-digit code). Creates the account on first use. */
export async function sendEmailLink(email: string, next?: string): Promise<void> {
  const sb = await getSupabase();
  await listen();
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
  });
  if (error) throw new Error(friendly(error.message));
}

/** Sign in with the 6-digit code from the email (works on any device). */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const sb = await getSupabase();
  await listen();
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  if (error) throw new Error(friendly(error.message));
  set(fromSession(data.session));
}

/** Redirects to the provider; returns to /auth/callback. Only for providers in OAUTH_PROVIDERS. */
export async function signInWithProvider(provider: OAuthProvider, next?: string): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(next) } });
  if (error) throw new Error(friendly(error.message));
}

/** Finish a sign-in from the callback URL. Resolves to the path to go to next. */
export async function completeSignInFromUrl(url: URL): Promise<string> {
  const p = parseCallback(url);
  if (p.kind === "error") throw new Error(friendly(p.message));
  const sb = await getSupabase();
  await listen();
  if (p.kind === "token_hash") {
    const { data, error } = await sb.auth.verifyOtp({ token_hash: p.tokenHash, type: p.type });
    if (error) throw new Error(friendly(error.message));
    set(fromSession(data.session));
  } else if (p.kind === "code") {
    const { data, error } = await sb.auth.exchangeCodeForSession(p.code);
    if (error) throw new Error(friendly(error.message));
    set(fromSession(data.session));
  } else {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new Error("This sign-in link is incomplete. Ask for a new one from Settings.");
    set(fromSession(data.session));
  }
  return p.next;
}

/** Sign out on this device only. Never throws: the local session is dropped either way. */
export async function signOut(): Promise<void> {
  if (!ACCOUNTS_ENABLED) return;
  try {
    if (hasSupabase() || hasStoredSession()) {
      const sb = await getSupabase();
      await sb.auth.signOut({ scope: "local" });
    }
  } catch {
    // offline or server error: clear the stored session ourselves
  }
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k === AUTH_STORAGE_KEY || k.startsWith(`${AUTH_STORAGE_KEY}-`)) window.localStorage.removeItem(k);
    }
  } catch {
    // storage blocked
  }
  set(SIGNED_OUT);
}

/** Delete the account and every server row (delete_my_account() in the migration), then sign out. */
export async function deleteAccount(): Promise<void> {
  const sb = await getSupabase();
  const { error } = await sb.rpc("delete_my_account");
  if (error) throw new Error(friendly(error.message));
  await signOut();
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("security purposes")) return "Too many emails just now. Wait a minute and try again.";
  if (m.includes("expired") || m.includes("invalid")) return "That link or code has expired or was already used. Ask for a new one.";
  if (m.includes("fetch") || m.includes("network")) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

/** Test hook. */
export function __resetAuthForTests(next: AuthState = ACCOUNTS_ENABLED ? LOADING : DISABLED) {
  state = next;
  initialized = false;
  listening = false;
  listeners.clear();
  userListeners.clear();
}
