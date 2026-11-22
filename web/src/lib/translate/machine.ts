// Server-only: the machine-translation endpoint behind /translate/api.
//
//   POST { text, from, to, romanized? }   translate (English <-> Bengali)
//   GET  ?health=1                        { configured } and nothing else; never calls Azure
//
// Forwards one short text to the Azure AI Translator REST API (v3). The key and region come from
// server environment variables and never leave the server: they are not returned, not logged and
// not part of any error message. User text is never logged.
//
// A request makes one or two Azure calls:
//   English -> Bengali   /translate, then /transliterate (Bengali -> Latin) for the romanization
//   Bengali -> English   /translate
//   romanized Bengali    /transliterate (Latin -> Bengali), then /translate (Bengali -> English)
// The romanization step is best effort: if it fails the translation is still returned.
import "server-only";
import { BUSY_MESSAGE, QUOTA_MESSAGE, type HealthResponse, type Lang, type MachineResponse } from "./types";

export const MAX_CHARS = 500;
/** Azure calls allowed per client per minute (a request makes one or two, and each counts). */
export const RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;
export const TIMEOUT_MS = 8_000;
/** Identical requests answered from memory (per server instance). */
export const SERVER_CACHE_MAX = 100;
export const SERVER_CACHE_TTL_MS = 60 * 60 * 1000;
/** After Azure says the allowance is gone, don't ask again for this long. */
export const QUOTA_HOLD_MS = 15 * 60 * 1000;
export const BUSY_HOLD_MS = 60 * 1000;
const BASE = "https://api.cognitive.microsofttranslator.com";

export interface MachineDeps {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

// --- per-instance state (in memory) ---------------------------------------------------------

const hits = new Map<string, { n: number; reset: number }>();
const answers = new Map<string, { body: Extract<MachineResponse, { ok: true }>; at: number }>();
let quotaUntil = 0;
let busyUntil = 0;

/** True if this client may spend `cost` more Azure calls now. */
export function allow(ip: string, now: number, cost = 1): boolean {
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { n: cost, reset: now + RATE_WINDOW_MS });
    return cost <= RATE_LIMIT;
  }
  if (h.n + cost > RATE_LIMIT) return false;
  h.n += cost;
  return true;
}

/** For tests: forget rate limits, cached answers and the quota hold. */
export function resetRateLimit() {
  hits.clear();
  answers.clear();
  quotaUntil = 0;
  busyUntil = 0;
}

function remember(key: string, body: Extract<MachineResponse, { ok: true }>, now: number) {
  answers.delete(key);
  answers.set(key, { body, at: now });
  while (answers.size > SERVER_CACHE_MAX) answers.delete(answers.keys().next().value as string);
}

function recall(key: string, now: number) {
  const e = answers.get(key);
  if (!e) return null;
  if (now - e.at > SERVER_CACHE_TTL_MS) {
    answers.delete(key);
    return null;
  }
  answers.delete(key);
  answers.set(key, e);
  return e.body;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// --- responses -----------------------------------------------------------------------------

const NO_STORE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function reply(body: MachineResponse | HealthResponse, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}
const fail = (status: number, error: string, extra?: Record<string, string>) =>
  reply({ ok: false, error }, status, extra);
const quota = () => reply({ ok: false, quota: true, error: QUOTA_MESSAGE }, 503);
const busy = () => reply({ ok: false, error: BUSY_MESSAGE }, 503);

const UNAVAILABLE = "Translation isn't available right now. Course words still work.";
const isLang = (v: unknown): v is Lang => v === "en" || v === "bn";
const hasBengali = (s: string) => /[ঀ-৿]/.test(s);

/** Reads the translated text out of an Azure v3 response body, or null if it isn't there. */
export function parseAzure(body: unknown): string | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const tr = (body[0] as { translations?: unknown })?.translations;
  if (!Array.isArray(tr) || tr.length === 0) return null;
  const text = (tr[0] as { text?: unknown })?.text;
  return typeof text === "string" ? text : null;
}

/** Reads the transliterated texts out of an Azure /transliterate response, or null. */
export function parseTransliterate(body: unknown, count: number): string[] | null {
  if (!Array.isArray(body) || body.length !== count) return null;
  const out: string[] = [];
  for (const b of body) {
    const t = (b as { text?: unknown })?.text;
    if (typeof t !== "string") return null;
    out.push(t);
  }
  return out;
}

// --- Azure calls ---------------------------------------------------------------------------

class AzureError extends Error {
  constructor(
    readonly kind: "quota" | "busy" | "timeout" | "provider",
  ) {
    super(kind);
  }
}

interface Azure {
  call: (path: string, payload: { Text: string }[]) => Promise<unknown>;
}

function azure(key: string, region: string | undefined, doFetch: typeof fetch, signal: AbortSignal): Azure {
  const headers: Record<string, string> = {
    "Ocp-Apim-Subscription-Key": key,
    "Content-Type": "application/json; charset=UTF-8",
  };
  if (region) headers["Ocp-Apim-Subscription-Region"] = region;
  return {
    async call(path, payload) {
      let res: Response;
      try {
        res = await doFetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(payload), signal, cache: "no-store" });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") throw new AzureError("timeout");
        console.warn("[translate] provider request failed");
        throw new AzureError("provider");
      }
      if (!res.ok) {
        // Log the status only: never the key, the text or the provider's message.
        console.warn(`[translate] provider answered ${res.status}`);
        // Read the error code and message (never logged) to tell the monthly quota from a burst.
        const raw = await res.text().catch(() => "");
        let code = 0;
        try {
          code = Number((JSON.parse(raw) as { error?: { code?: unknown } })?.error?.code) || 0;
        } catch {
          // Not JSON.
        }
        const quotaHit = code === 403001 || /exceeded[^"]*quota|quota[^"]*exceeded|allowance/i.test(raw);
        if (res.status === 429) throw new AzureError(quotaHit ? "quota" : "busy");
        // The Free tier hard-stops at its monthly limit: 403 with code 403001 ("exceeded its free
        // quota"). A bare 403000 ("operation isn't allowed") is something else, such as a bad key.
        if (res.status === 403 && quotaHit) throw new AzureError("quota");
        throw new AzureError("provider");
      }
      return res.json().catch(() => null);
    },
  };
}

const translatePath = (from: Lang, to: Lang) => `/translate?api-version=3.0&from=${from}&to=${to}`;
const TO_BENGALI_SCRIPT = "/transliterate?api-version=3.0&language=bn&fromScript=Latn&toScript=Beng";
const TO_LATIN = "/transliterate?api-version=3.0&language=bn&fromScript=Beng&toScript=Latn";

// --- handlers ------------------------------------------------------------------------------

/** GET /translate/api?health=1: is a key set? Never calls Azure, never returns the key. */
function handleHealth(env: Record<string, string | undefined>): Response {
  return reply({ configured: Boolean(env.AZURE_TRANSLATOR_KEY?.trim()) }, 200);
}

export async function handleTranslate(req: Request, deps: MachineDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  if (req.method === "GET") {
    // Reading the URL also makes this handler dynamic (never prerendered) under Cache Components.
    const url = new URL(req.url);
    if (url.searchParams.get("health") === "1") return handleHealth(env);
    return fail(405, "Use POST.", { Allow: "POST" });
  }
  if (req.method !== "POST") return fail(405, "Use POST.", { Allow: "GET, POST" });

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
  const { text: rawText, from, to, romanized: rawRom } = (body ?? {}) as {
    text?: unknown;
    from?: unknown;
    to?: unknown;
    romanized?: unknown;
  };
  if (typeof rawText !== "string" || !rawText.trim()) return fail(400, "Type something to translate.");
  const text = rawText.trim();
  if (text.length > MAX_CHARS) return fail(400, `Keep it under ${MAX_CHARS} characters.`);
  if (!isLang(from) || !isLang(to) || from === to) return fail(400, "Choose English → Bengali or Bengali → English.");
  // Romanized input is Latin-script Bengali going to English.
  const romanized = rawRom === true && from === "bn" && to === "en" && !hasBengali(text);
  if (from === "bn" && !romanized && !hasBengali(text)) return fail(400, "Type Bengali in Bengali script, or choose romanized Bengali.");

  const t = now();
  const cacheKey = `${from}>${to}${romanized ? "r" : ""}|${text}`;
  const cached = recall(cacheKey, t);
  if (cached) return reply(cached, 200);

  if (quotaUntil > t) return quota();
  if (busyUntil > t) return busy();

  // English -> Bengali and romanized input each make two Azure calls; each one counts.
  const cost = to === "bn" || romanized ? 2 : 1;
  if (!allow(clientIp(req), t, cost)) {
    return fail(429, "Too many translations in a minute. Wait a moment and try again.", {
      "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1000)),
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? TIMEOUT_MS);
  const az = azure(key, region, doFetch, ctrl.signal);
  try {
    let source = text;
    let read: string | undefined;
    if (romanized) {
      const got = parseTransliterate(await az.call(TO_BENGALI_SCRIPT, [{ Text: text }]), 1);
      if (!got || !got[0].trim() || !hasBengali(got[0])) return fail(502, UNAVAILABLE);
      source = read = got[0].trim();
    }
    const out = parseAzure(await az.call(translatePath(romanized ? "bn" : from, to), [{ Text: source }]));
    if (out === null) return fail(502, UNAVAILABLE);

    const ok: Extract<MachineResponse, { ok: true }> = { ok: true, text: out, from, to, ...(read ? { read } : {}) };
    if (to === "bn" && hasBengali(out)) {
      // Best effort: the translation is already in hand.
      try {
        const words = out.split(/\s+/).filter(Boolean);
        const roman = parseTransliterate(await az.call(TO_LATIN, words.map((Text) => ({ Text }))), words.length);
        if (roman) ok.roman = roman;
      } catch (err) {
        if (err instanceof AzureError && err.kind === "quota") quotaUntil = now() + QUOTA_HOLD_MS;
      }
    }
    remember(cacheKey, ok, now());
    return reply(ok, 200);
  } catch (err) {
    const kind = err instanceof AzureError ? err.kind : "provider";
    if (kind === "quota") {
      quotaUntil = now() + QUOTA_HOLD_MS;
      return quota();
    }
    if (kind === "busy") {
      // An ordinary Azure 429 burst: pause briefly so we don't keep asking.
      busyUntil = now() + BUSY_HOLD_MS;
      return busy();
    }
    if (kind === "timeout") return fail(504, "Translation took too long. Try again.");
    return fail(502, UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}
