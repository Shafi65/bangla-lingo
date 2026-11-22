import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTranslate, parseAzure, parseTransliterate, QUOTA_HOLD_MS, RATE_LIMIT, resetRateLimit } from "@/lib/translate/machine";
import { pushRecent, RECENT_MAX, requestMachine } from "@/lib/translate/client";
import { BUSY_MESSAGE, QUOTA_MESSAGE } from "@/lib/translate/types";
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

/** A fake Azure: /translate answers `text`; /transliterate echoes `roman` (or one fixed answer per call). */
const azureOk = (text: string, roman: (texts: string[], url: string) => string[] = (t) => t.map(() => "x")) =>
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as { Text: string }[];
    if (url.includes("/transliterate")) {
      return Response.json(roman(body.map((b) => b.Text), url).map((t) => ({ text: t, script: "x" })));
    }
    return Response.json([{ translations: [{ text, to: "bn" }] }]);
  });
const urlsOf = (f: { mock: { calls: unknown[][] } }) => f.mock.calls.map((c) => String(c[0]));

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

  it("treats a blank or whitespace-only key as not set up, even with a region", async () => {
    const fetch = vi.fn();
    for (const e of [{ AZURE_TRANSLATOR_KEY: "   ", AZURE_TRANSLATOR_REGION: "eastus" }, { AZURE_TRANSLATOR_REGION: "eastus" }]) {
      const res = await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env: e, fetch });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, configured: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("the client turns the unconfigured answer into the calm 'unconfigured' state", async () => {
    const res = await handleTranslate(post({ text: "hi", from: "en", to: "bn" }), { env: {} });
    vi.stubGlobal("fetch", vi.fn(async () => res));
    try {
      expect(await requestMachine("hi", "en", "bn")).toEqual({ s: "unconfigured" });
    } finally {
      vi.unstubAllGlobals();
    }
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
    const fetch = azureOk("ধন্যবাদ", () => ["dhonyobad"]);
    const res = await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, text: "ধন্যবাদ", from: "en", to: "bn", roman: ["dhonyobad"] });

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
    const res = await handleTranslate(post({ text: "আমি", from: "bn", to: "en" }), {
      env,
      fetch: hang as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(res.status).toBe(504);
  });

  it("rate-limits each client per minute, counting every Azure call", async () => {
    const fetch = azureOk("আমি");
    let t = 1_000;
    const now = () => t;
    const one = () => post({ text: "আমি ভাত", from: "bn", to: "en" }); // one Azure call (a new text, so not served from memory)
    const two = () => post({ text: "hello", from: "en", to: "bn" }); // translate + transliterate = two
    // 58 single calls, then one two-call request fits exactly (60), and the next doesn't.
    for (let i = 0; i < RATE_LIMIT - 2; i++) {
      expect((await handleTranslate(post({ text: `আমি${"ি".repeat(i)}`, from: "bn", to: "en" }), { env, fetch, now })).status).toBe(200);
    }
    expect((await handleTranslate(two(), { env, fetch, now })).status).toBe(200);
    const limited = await handleTranslate(one(), { env, fetch, now });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    // another client is unaffected; the window resets
    const other = post({ text: "আমি", from: "bn", to: "en" }, { "x-forwarded-for": "198.51.100.1" });
    expect((await handleTranslate(other, { env, fetch, now })).status).toBe(200);
    t += 61_000;
    expect((await handleTranslate(one(), { env, fetch, now })).status).toBe(200); // not in memory: allowed again once the window resets
  });

  it("a request that needs two calls is refused up front when only one is left", async () => {
    const fetch = azureOk("আমি");
    const now = () => 1_000;
    for (let i = 0; i < RATE_LIMIT - 1; i++) {
      await handleTranslate(post({ text: `আমি${"ি".repeat(i)}`, from: "bn", to: "en" }), { env, fetch, now });
    }
    const calls = fetch.mock.calls.length;
    const res = await handleTranslate(post({ text: "hello", from: "en", to: "bn" }), { env, fetch, now });
    expect(res.status).toBe(429);
    expect(fetch.mock.calls.length).toBe(calls); // nothing was sent to Azure
  });
});

describe("English -> Bengali with romanization", () => {
  it("translates, then transliterates each Bengali word (Beng -> Latn) in the same call", async () => {
    const fetch = azureOk("আমি ভাত খাই।", (texts) => texts.map((t) => `r:${t}`));
    const res = await handleTranslate(post({ text: "I eat rice.", from: "en", to: "bn" }), { env, fetch });
    expect(await res.json()).toEqual({
      ok: true,
      text: "আমি ভাত খাই।",
      from: "en",
      to: "bn",
      roman: ["r:আমি", "r:ভাত", "r:খাই।"],
    });
    expect(urlsOf(fetch)).toEqual([
      "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=bn",
      "https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0&language=bn&fromScript=Beng&toScript=Latn",
    ]);
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual([{ Text: "আমি" }, { Text: "ভাত" }, { Text: "খাই।" }]);
  });

  it("still returns the translation when the romanization fails or doesn't line up", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/transliterate")
        ? new Response("oops", { status: 500 })
        : Response.json([{ translations: [{ text: "ধন্যবাদ" }] }]),
    );
    const a = await (await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch: failing })).json();
    expect(a).toEqual({ ok: true, text: "ধন্যবাদ", from: "en", to: "bn" });

    resetRateLimit();
    const short = azureOk("আমি ভাত", () => ["ami"]);
    const b = await (await handleTranslate(post({ text: "I rice", from: "en", to: "bn" }), { env, fetch: short })).json();
    expect(b.roman).toBeUndefined();
  });
});

describe("romanized Bengali input", () => {
  it("transliterates Latn -> Beng, then translates bn -> en, and returns what it read", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/transliterate")
        ? Response.json([{ text: "আমি ভাত খাই", script: "Beng" }])
        : Response.json([{ translations: [{ text: "I eat rice", to: "en" }] }]),
    );
    const res = await handleTranslate(post({ text: "ami bhat khai", from: "bn", to: "en", romanized: true }), { env, fetch });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: "I eat rice", from: "bn", to: "en", read: "আমি ভাত খাই" });
    expect(urlsOf(fetch)).toEqual([
      "https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0&language=bn&fromScript=Latn&toScript=Beng",
      "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=bn&to=en",
    ]);
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(calls[0][1].body as string)).toEqual([{ Text: "ami bhat khai" }]);
    expect(JSON.parse(calls[1][1].body as string)).toEqual([{ Text: "আমি ভাত খাই" }]); // the Bengali, not the Latin
  });

  it("counts both calls against the limit", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/transliterate")
        ? Response.json([{ text: "আমি", script: "Beng" }])
        : Response.json([{ translations: [{ text: "I" }] }]),
    );
    const now = () => 5_000;
    let ok = 0;
    for (let i = 0; i < RATE_LIMIT; i++) {
      const r = await handleTranslate(post({ text: `ami${"i".repeat(i)}`, from: "bn", to: "en", romanized: true }), { env, fetch, now });
      if (r.status === 200) ok++;
    }
    expect(ok).toBe(RATE_LIMIT / 2);
  });

  it("answers 502 when the reading isn't Bengali, and ignores the flag outside bn -> en", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const echo = vi.fn(async () => Response.json([{ text: "ami", script: "Latn" }]));
    expect((await handleTranslate(post({ text: "ami", from: "bn", to: "en", romanized: true }), { env, fetch: echo })).status).toBe(502);

    resetRateLimit();
    const fetch = azureOk("ধন্যবাদ");
    await handleTranslate(post({ text: "thanks", from: "en", to: "bn", romanized: true }), { env, fetch });
    expect(urlsOf(fetch)[0]).toContain("/translate?");
  });

  it("rejects Latin text sent as Bengali without the romanized flag", async () => {
    const fetch = vi.fn();
    expect((await handleTranslate(post({ text: "ami bhat", from: "bn", to: "en" }), { env, fetch })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("quota and cost safety", () => {
  const quotaBody = JSON.stringify({ error: { code: 403001, message: "The operation isn't allowed because the subscription exceeded its free quota." } });

  it("an ordinary Azure 429 burst (429000-429002 or unknown) says 'busy' and pauses for a minute", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const body of ['{"error":{"code":429001,"message":"The server rejected the request because the client has exceeded request limits."}}', "{}", "slow down"]) {
      resetRateLimit();
      const fetch = vi.fn(async () => new Response(body, { status: 429 }));
      let t = 1_000;
      const now = () => t;
      const res = await handleTranslate(post({ text: "hello", from: "en", to: "bn" }), { env, fetch, now });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false, error: BUSY_MESSAGE });
      expect(BUSY_MESSAGE).toBe("Translation is busy, try again in a minute. Course words still work.");
      const again = await handleTranslate(post({ text: "other words", from: "en", to: "bn" }), { env, fetch, now });
      expect((await again.json()).error).toBe(BUSY_MESSAGE);
      expect(fetch).toHaveBeenCalledTimes(1);
      t += 60_001;
      await handleTranslate(post({ text: "other words", from: "en", to: "bn" }), { env, fetch, now });
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });

  it("a 429 that says the quota/allowance is exceeded gets the allowance message and the long pause", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 403001, message: "The subscription exceeded its free quota." } }), { status: 429 }));
    let t = 1_000;
    const now = () => t;
    const res = await handleTranslate(post({ text: "hello", from: "en", to: "bn" }), { env, fetch, now });
    expect(await res.json()).toEqual({ ok: false, quota: true, error: QUOTA_MESSAGE });
    expect(QUOTA_MESSAGE).toBe("The free translation allowance is used up for this month; course words still work.");
    t += 60_001;
    await handleTranslate(post({ text: "hello again", from: "en", to: "bn" }), { env, fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1); // still paused after a minute
  });

  it("maps the Free tier's hard stop (403, code 403001) the same way, for a long hold", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(quotaBody, { status: 403 }));
    let t = 1_000;
    const now = () => t;
    const res = await handleTranslate(post({ text: "hello", from: "en", to: "bn" }), { env, fetch, now });
    expect(await res.json()).toEqual({ ok: false, quota: true, error: QUOTA_MESSAGE });
    t += QUOTA_HOLD_MS - 1;
    await handleTranslate(post({ text: "hello again", from: "en", to: "bn" }), { env, fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
    t += 2;
    await handleTranslate(post({ text: "hello again", from: "en", to: "bn" }), { env, fetch, now });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("a plain 403000 (operation not allowed) is a provider error, not 'allowance used up'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 403000, message: "The operation isn't allowed." } }), { status: 403 }));
    const res = await handleTranslate(post({ text: "hello", from: "en", to: "bn" }), { env, fetch });
    expect(res.status).toBe(502);
  });

  it("quota running out during the romanization step still returns the translation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/transliterate") ? new Response(quotaBody, { status: 403 }) : Response.json([{ translations: [{ text: "ধন্যবাদ" }] }]),
    );
    const res = await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch });
    expect(await res.json()).toEqual({ ok: true, text: "ধন্যবাদ", from: "en", to: "bn" });
  });

  it("answers an identical request from memory, without calling Azure or counting against the limit", async () => {
    const fetch = azureOk("ধন্যবাদ", () => ["dhonnobad"]);
    const now = () => 1_000;
    const first = await (await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch, now })).json();
    expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < RATE_LIMIT * 2; i++) {
      const r = await handleTranslate(post({ text: "thank you", from: "en", to: "bn" }), { env, fetch, now });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual(first);
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    // A different direction or romanized flag is a different request.
    await handleTranslate(post({ text: "আমি", from: "bn", to: "en" }), { env, fetch, now });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never logs the text or the key, on any path", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretText = "my secret sentence";
    for (const status of [429, 403, 500]) {
      resetRateLimit();
      const fetch = vi.fn(async () => new Response(`echo ${secretText} ${KEY}`, { status }));
      await handleTranslate(post({ text: secretText, from: "en", to: "bn" }), { env, fetch });
    }
    resetRateLimit();
    await handleTranslate(post({ text: secretText, from: "en", to: "bn" }), { env, fetch: vi.fn(async () => { throw new Error(`${secretText} ${KEY}`); }) });
    for (const spy of [warn, log, err]) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain(KEY);
        expect(call.join(" ")).not.toContain(secretText);
      }
    }
  });
});

describe("GET /translate/api?health=1", () => {
  const get = (qs = "?health=1") => new Request(`http://localhost/translate/api${qs}`);

  it("says whether a key is set, and nothing else", async () => {
    const fetch = vi.fn();
    const on = await handleTranslate(get(), { env, fetch });
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ configured: true });
    const off = await handleTranslate(get(), { env: { AZURE_TRANSLATOR_REGION: "x" }, fetch });
    expect(await off.json()).toEqual({ configured: false });
    const blank = await handleTranslate(get(), { env: { AZURE_TRANSLATOR_KEY: "  " }, fetch });
    expect(await blank.json()).toEqual({ configured: false });
    expect(fetch).not.toHaveBeenCalled(); // never calls Azure
  });

  it("never leaks the key or region, is uncached and not indexed", async () => {
    const res = await handleTranslate(get(), { env, fetch: vi.fn() });
    const raw = await res.text();
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain("southeastasia");
    expect(Object.keys(JSON.parse(raw))).toEqual(["configured"]);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    for (const [, v] of res.headers) expect(v).not.toContain(KEY);
  });

  it("a GET without ?health=1 is still 405", async () => {
    expect((await handleTranslate(get(""), { env })).status).toBe(405);
    expect((await handleTranslate(get("?health=0"), { env })).status).toBe(405);
  });

  it("is not rate limited or cached by the quota hold", async () => {
    for (let i = 0; i < RATE_LIMIT * 2; i++) expect((await handleTranslate(get(), { env })).status).toBe(200);
  });
});

describe("helpers", () => {
  it("parseTransliterate needs one text per input", () => {
    expect(parseTransliterate([{ text: "ami", script: "Latn" }], 1)).toEqual(["ami"]);
    expect(parseTransliterate([{ text: "ami" }], 2)).toBeNull();
    expect(parseTransliterate([{ nope: 1 }], 1)).toBeNull();
    expect(parseTransliterate({}, 1)).toBeNull();
  });

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
