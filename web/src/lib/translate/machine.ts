// Server-only: the machine-translation endpoint behind POST /translate/api.
//
// Forwards one short text to the Azure AI Translator REST API (v3) and returns the translation.
// The key and region come from server environment variables and never leave the server: they are
// not returned, not logged, and not part of any error message. User text is never cached or logged.
import "server-only";
import type { Lang, MachineResponse } from "./types";

export const MAX_CHARS = 500;
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60_000;
export const TIMEOUT_MS = 8_000;
const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";

export interface MachineDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

// --- rate limiting (per instance, in memory) -------------------------------------------------

const hits = new Map<string, { n: number; reset: number }>();

/** True if this client may make another request now. */
export function allow(ip: string, now: number): boolean {
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { n: 1, reset: now + RATE_WINDOW_MS });
    return true;
  }
  if (h.n >= RATE_LIMIT) return false;
  h.n++;
  return true;
}

/** For tests. */
export function resetRateLimit() {
  hits.clear();
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// --- responses -----------------------------------------------------------------------------

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function reply(body: MachineResponse, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}
const fail = (status: number, error: string, extra?: Record<string, string>) =>
  reply({ ok: false, error }, status, extra);

const isLang = (v: unknown): v is Lang => v === "en" || v === "bn";

/** Reads the translated text out of an Azure v3 response body, or null if it isn't there. */
export function parseAzure(body: unknown): string | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const tr = (body[0] as { translations?: unknown })?.translations;
  if (!Array.isArray(tr) || tr.length === 0) return null;
  const text = (tr[0] as { text?: unknown })?.text;
  return typeof text === "string" ? text : null;
}

export async function handleTranslate(req: Request, deps: MachineDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  if (req.method !== "POST") return fail(405, "Use POST.", { Allow: "POST" });

  const key = env.AZURE_TRANSLATOR_KEY?.trim();
  const region = env.AZURE_TRANSLATOR_REGION?.trim();
  if (!key) return reply({ ok: false, configured: false }, 503);

  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) return fail(415, "Send JSON.");

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 16_384) return fail(413, "That request is too large.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "That request couldn't be read.");
  }
  const { text, from, to } = (body ?? {}) as { text?: unknown; from?: unknown; to?: unknown };
  if (typeof text !== "string" || !text.trim()) return fail(400, "Type something to translate.");
  if (text.length > MAX_CHARS) return fail(400, `Keep it under ${MAX_CHARS} characters.`);
  if (!isLang(from) || !isLang(to) || from === to) return fail(400, "Choose English → Bengali or Bengali → English.");

  if (!allow(clientIp(req), now())) {
    return fail(429, "Too many translations in a minute. Wait a moment and try again.", {
      "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)),
    });
  }

  const url = `${ENDPOINT}?api-version=3.0&from=${from}&to=${to}`;
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "application/json; charset=UTF-8",
  };
  if (region) headers["Ocp-Apim-Subscription-Region"] = region;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify([{ Text: text }]),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // Log the status only: never the key, the text or the provider's message.
      console.warn(`[translate] provider answered ${res.status}`);
      if (res.status === 429) return fail(503, "Translation is busy right now. Try again in a minute.");
      return fail(502, "Translation isn't available right now. Course words still work.");
    }
    const out = parseAzure(await res.json().catch(() => null));
    if (out === null) return fail(502, "Translation isn't available right now. Course words still work.");
    return reply({ ok: true, text: out, from, to }, 200);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      return fail(504, "Translation took too long. Try again.");
    }
    console.warn("[translate] provider request failed");
    return fail(502, "Translation isn't available right now. Course words still work.");
  } finally {
    clearTimeout(timer);
  }
}
