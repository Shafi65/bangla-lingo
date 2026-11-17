import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTranslate, parseAzure, RATE_LIMIT, resetRateLimit } from "@/lib/translate/machine";
import { pushRecent, RECENT_MAX } from "@/lib/translate/client";
import { pageRoutesFromManifest, shellRoutes } from "@/lib/offline/routes";

const KEY = "sekret-key-123";
const env = { AZURE_TRANSLATOR_KEY: KEY, AZURE_TRANSLATOR_REGION: "southeastasia" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/translate/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const azureOk = (text: string) =>
  vi.fn(async () => Response.json([{ translations: [{ text, to: "bn" }] }]));

beforeEach(() => resetRateLimit());
afterEach(() => vi.restoreAllMocks());

describe("POST /translate/api", () => {
  it("answers 503 {configured:false} when no key is set, without calling out", async () => {
    const fetch = vi.fn();
    const res = await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env: {}, fetch });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, configured: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects other methods", async () => {
    const res = await handleTranslate(new Request("http://localhost/translate/api"), { env });
    expect(res.status).toBe(405);
  });

  it.each([
    ["empty text", { text: "  ", from: "en", to: "bn" }],
    ["text over 500 characters", { text: "a".repeat(501), from: "en", to: "bn" }],
    ["unknown language", { text: "hi", from: "fr", to: "bn" }],
    ["same language", { text: "hi", from: "en", to: "en" }],
    ["text not a string", { text: 5, from: "en", to: "bn" }],
  ])("400 for %s", async (_name, body) => {
    const fetch = vi.fn();
    const res = await handleTranslate(post(body), { env, fetch });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("400 for malformed JSON and 415 for a non-JSON body", async () => {
    expect((await handleTranslate(post("{not json"), { env })).status).toBe(400);
    expect((await handleTranslate(post("text", { "content-type": "text/plain" }), { env })).status).toBe(415);
  });

  it("forwards to the provider and returns the parsed text, uncached", async () => {
    const fetch = azureOk("ধন্যবাদ");
    const res = await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, text: "ধন্যবাদ", from: "en", to: "bn" });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=bn");
    const h = init.headers as Record<string, string>;
    expect(h["Ocp-Apim-Subscription-Key"]).toBe(KEY);
    expect(h["Ocp-Apim-Subscription-Region"]).toBe("southeastasia");
    expect(JSON.parse(init.body as string)).toEqual([{ Text: "thank you" }]);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it("turns a provider error into a friendly 502 and never leaks the key or logs the text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(`{"error":{"message":"bad key ${KEY}"}}`, { status: 401 }));
    const res = await handleTranslate(post({ text: "private words", from: "en", to: "bn" }), { env, fetch });
    expect(res.status).toBe(502);
    const raw = await res.text();
    expect(raw).not.toContain(KEY);
    expect(JSON.parse(raw).error).toMatch(/course words still work/i);
    for (const call of warn.mock.calls) {
      expect(call.join(" ")).not.toContain(KEY);
      expect(call.join(" ")).not.toContain("private words");
    }
  });

  it("502 for an unexpected provider body, 504 on timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const odd = vi.fn(async () => Response.json({ nope: true }));
    expect((await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env, fetch: odd })).status).toBe(502);

    const hang = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
        ),
    );
    const res = await handleTranslate(post({ text: "hi", from: "bn", to: "en" }), {
      env,
      fetch: hang as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(res.status).toBe(504);
  });

  it("rate-limits each client per minute", async () => {
    const fetch = azureOk("x");
    let t = 1_000;
    const now = () => t;
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env, fetch, now })).status).toBe(200);
    }
    const limited = await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env, fetch, now });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    // another client is unaffected; the window resets
    const other = post({ text: "hi", from: "en", to: "bn" }, { "x-forwarded-for": "198.51.100.1" });
    expect((await handleTranslate(other, { env, fetch, now })).status).toBe(200);
    t += 61_000;
    expect((await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env, fetch, now })).status).toBe(200);
  });
});

describe("helpers", () => {
  it("parseAzure reads the first translation", () => {
    expect(parseAzure([{ translations: [{ text: "Hello", to: "en" }] }])).toBe("Hello");
    expect(parseAzure([])).toBeNull();
    expect(parseAzure({ error: {} })).toBeNull();
  });

  it("pushRecent de-duplicates and keeps the last ten", () => {
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, `w${i}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe("w11");
    expect(pushRecent(["Thank you", "ami"], " thank  you ")).toEqual(["thank you", "ami"]);
  });

  it("precaches /translate but never the POST-only /translate/api", () => {
    expect(shellRoutes({ lessonIds: [], guideUnitIds: [] })).toContain("/translate");
    expect(pageRoutesFromManifest(["/translate", "/translate/api", "/api/x", "/apiary"])).toEqual(["/translate", "/apiary"]);
  });
});
