/* BanglaLingo service worker (hand-written, no libraries).
 *
 * Registered as /sw.js?b=<build id>. The query makes every build a new script
 * URL, so browsers install the new worker (and its own versioned cache) on each
 * deploy even though this file's bytes never change.
 *
 *   bl-shell-<build id>  app shell: pages, hashed static assets, fonts, RSC payloads
 *                        (deleted on activate when the build id changes)
 *   bl-audio-v1          downloaded audio packs, filled by the page (never precached;
 *                        survives updates, only removed by the user)
 *
 * Strategies (same-origin GET only; everything else is left to the browser):
 *   page navigations    network first (3.5 s timeout when a copy exists), cache fallback, else redirect to /offline
 *   RSC payloads        network first, cache fallback (soft navigations)
 *   /_next/static/*     cache first (content-hashed)
 *   /audio/*            downloaded cache first (with Range support), else network, never stored here
 *   everything else     network first, cache fallback
 */
"use strict";

var AUDIO_CACHE = "bl-audio-v1";
var SHELL_PREFIX = "bl-shell-";
var MANIFEST_URL = "/offline/precache.json";
var NAV_TIMEOUT_MS = 3500;
var RSC_CACHE_LIMIT = 250;

// ---------------------------------------------------------------------------
// Pure helpers (also exported for unit tests, see the bottom of the file)

function versionFromUrl(scriptUrl) {
  try {
    var v = new URL(scriptUrl).searchParams.get("b") || "";
    v = v.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    return v || "dev";
  } catch {
    return "dev";
  }
}

function shellCacheName(version) {
  return SHELL_PREFIX + version;
}

/** Caches this app owns that are not the current shell and not the audio store. */
function isStaleCache(name, currentShell) {
  return name.indexOf("bl-") === 0 && name !== AUDIO_CACHE && name !== currentShell;
}

/** Cache key for a page: origin + path, no query or hash, no trailing slash (except "/"). */
function pageKey(url) {
  var u = new URL(url);
  var p = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  return u.origin + (p || "/");
}

/**
 * What to do with a request: "skip" (let the browser handle it), "audio", "static", "rsc", "nav" or "other".
 * `headers` only needs a get(name) method.
 */
function classify(method, urlString, mode, headers, origin) {
  if (method !== "GET") return "skip";
  var u;
  try {
    u = new URL(urlString);
  } catch {
    return "skip";
  }
  if (u.origin !== origin || (u.protocol !== "http:" && u.protocol !== "https:")) return "skip";
  var p = u.pathname;
  if (p === "/sw.js" || p === MANIFEST_URL || p.indexOf("/api/") === 0) return "skip";
  if (p.indexOf("/audio/") === 0) return "audio";
  if (p.indexOf("/_next/static/") === 0) return "static";
  if (mode === "navigate") return "nav";
  if (headers.get("rsc") || u.searchParams.has("_rsc")) return "rsc";
  return "other";
}

/** Unique same-origin build assets (/_next/static/...) mentioned in HTML or flight text. */
function extractStaticUrls(text) {
  var out = [];
  var seen = {};
  var re = /\/_next\/static\/[A-Za-z0-9_\-./~%@+]+\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|avif|ico)/g;
  var m;
  while ((m = re.exec(text))) {
    if (!seen[m[0]]) {
      seen[m[0]] = 1;
      out.push(m[0]);
    }
  }
  return out;
}

/** Icon / manifest links from <link href="..."> tags in an HTML document. */
function extractLinkedFiles(html) {
  var out = [];
  var re = /<link\b[^>]*?\bhref="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    var href = m[1].replace(/&amp;/g, "&");
    if (href.charAt(0) === "/" && href.charAt(1) !== "/" && /\.(?:png|ico|svg|webmanifest)(?:\?|$)/.test(href) && out.indexOf(href) < 0) {
      out.push(href);
    }
  }
  return out;
}

/** "bytes=a-b" -> { start, end } clamped to `size`, or null when unsatisfiable / unsupported. */
function parseRange(header, size) {
  var m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "") || size <= 0) return null;
  var start, end;
  if (m[1] === "") {
    var n = parseInt(m[2], 10);
    if (!n) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === "" ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
  }
  if (start >= size || start > end) return null;
  return { start: start, end: end };
}

// ---------------------------------------------------------------------------
// Runtime

function currentVersion() {
  return versionFromUrl(self.location.href);
}

function openShell() {
  return caches.open(shellCacheName(currentVersion()));
}

function okToStore(res) {
  return res && res.ok && res.type === "basic";
}

/** Fetch with `cache: reload` so precaching never stores an HTTP-cache copy from an older build. */
function fetchFresh(url) {
  return fetch(url, { cache: "reload", credentials: "same-origin" });
}

async function precacheOne(cache, url, key, seenAssets) {
  try {
    var res = await fetchFresh(url);
    if (!okToStore(res)) return false;
    var isHtml = (res.headers.get("content-type") || "").indexOf("text/html") >= 0;
    var text = isHtml ? await res.clone().text() : "";
    await cache.put(key || url, res);
    if (isHtml) {
      var more = extractStaticUrls(text).concat(extractLinkedFiles(text));
      for (var i = 0; i < more.length; i++) {
        if (!seenAssets[more[i]]) {
          seenAssets[more[i]] = 1;
          await precacheOne(cache, more[i], more[i], seenAssets);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function pool(items, size, worker) {
  var i = 0;
  var runners = [];
  for (var k = 0; k < Math.min(size, items.length); k++) {
    runners.push(
      (async function () {
        while (i < items.length) {
          var item = items[i++];
          await worker(item);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

async function precacheAll() {
  var cache = await openShell();
  var res = await fetchFresh(MANIFEST_URL);
  if (!res.ok) throw new Error("precache manifest " + res.status);
  var manifest = await res.json();
  var routes = Array.isArray(manifest.routes) ? manifest.routes : [];
  var assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  var seen = {};

  // Essentials: failing any of these fails the install (it is retried later).
  assets.forEach(function (a) {
    seen[a] = 1;
  });
  var must = ["/", "/offline"];
  for (var i = 0; i < must.length; i++) {
    var ok = await precacheOne(cache, must[i], pageKey(self.location.origin + must[i]), seen);
    if (!ok) throw new Error("could not precache " + must[i]);
  }
  await pool(assets, 6, function (a) {
    return precacheOne(cache, a, a, seen);
  });
  // The rest of the routes are best effort; anything missed is cached when first visited.
  var rest = routes.filter(function (r) {
    return must.indexOf(r) < 0;
  });
  await pool(rest, 6, function (r) {
    return precacheOne(cache, r, pageKey(self.location.origin + r), seen);
  });
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("install", function (event) {
    event.waitUntil(
      precacheAll().then(function () {
        // First install: take over straight away. Updates wait for the user ("Refresh").
        if (!self.registration.active) return self.skipWaiting();
      }),
    );
  });

  self.addEventListener("activate", function (event) {
    event.waitUntil(
      (async function () {
        var current = shellCacheName(currentVersion());
        var names = await caches.keys();
        await Promise.all(
          names.filter(function (n) { return isStaleCache(n, current); }).map(function (n) { return caches.delete(n); }),
        );
        await self.clients.claim();
      })(),
    );
  });

  self.addEventListener("message", function (event) {
    var d = event.data || {};
    if (d.type === "SKIP_WAITING") self.skipWaiting();
    else if (d.type === "GET_VERSION" && event.source) event.source.postMessage({ type: "VERSION", version: currentVersion() });
  });

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(
        function (v) { clearTimeout(t); resolve(v); },
        function (e) { clearTimeout(t); reject(e); },
      );
    });
  }

  async function trimRsc(cache) {
    var keys = await cache.keys();
    var rsc = keys.filter(function (r) { return r.url.indexOf("_rsc=") >= 0; });
    for (var i = 0; i < rsc.length - RSC_CACHE_LIMIT; i++) await cache.delete(rsc[i]);
  }

  /** Network first with a cache fallback. `key` is what the response is stored under. */
  async function networkFirst(event, key, fallbackKey, timeoutMs) {
    var cache = await openShell();
    var cached = await cache.match(key, { ignoreVary: true });
    var network = fetch(event.request).then(function (res) {
      if (okToStore(res)) {
        event.waitUntil(
          cache.put(key, res.clone()).then(function () {
            return key.indexOf("_rsc=") >= 0 ? trimRsc(cache) : undefined;
          }).catch(function () {}),
        );
      }
      return res;
    });
    try {
      return cached && timeoutMs ? await withTimeout(network, timeoutMs) : await network;
    } catch (e) {
      network.catch(function () {});
      if (cached) return cached;
      if (fallbackKey) {
        var fb = await cache.match(fallbackKey, { ignoreVary: true });
        if (fb) return fb;
      }
      throw e;
    }
  }

  /** Pages: network first; an uncached page while offline redirects to the /offline screen. */
  async function navigate(event) {
    try {
      return await networkFirst(event, pageKey(event.request.url), null, NAV_TIMEOUT_MS);
    } catch (e) {
      var cache = await openShell();
      var offlinePage = await cache.match(pageKey(self.location.origin + "/offline"), { ignoreVary: true });
      if (offlinePage && pageKey(event.request.url) !== pageKey(self.location.origin + "/offline")) {
        return Response.redirect(self.location.origin + "/offline", 302);
      }
      throw e;
    }
  }

async function cacheFirst(event) {
    var cache = await openShell();
    var hit = await cache.match(event.request.url, { ignoreVary: true });
    if (hit) return hit;
    var res = await fetch(event.request);
    if (okToStore(res)) event.waitUntil(cache.put(event.request.url, res.clone()).catch(function () {}));
    return res;
  }

  async function audio(request) {
    var cache = await caches.open(AUDIO_CACHE);
    var hit = await cache.match(request.url, { ignoreVary: true });
    if (!hit) return fetch(request);
    var header = request.headers.get("range");
    if (!header) return hit;
    var buf = await hit.arrayBuffer();
    var r = parseRange(header, buf.byteLength);
    if (!r) {
      return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + buf.byteLength } });
    }
    return new Response(buf.slice(r.start, r.end + 1), {
      status: 206,
      headers: {
        "Content-Type": hit.headers.get("content-type") || "audio/mpeg",
        "Content-Length": String(r.end - r.start + 1),
        "Content-Range": "bytes " + r.start + "-" + r.end + "/" + buf.byteLength,
        "Accept-Ranges": "bytes",
      },
    });
  }

  self.addEventListener("fetch", function (event) {
    var req = event.request;
    var kind = classify(req.method, req.url, req.mode, req.headers, self.location.origin);
    if (kind === "skip") return;
    if (kind === "audio") return event.respondWith(audio(req));
    if (kind === "static") return event.respondWith(cacheFirst(event));
    if (kind === "nav") return event.respondWith(navigate(event));
    if (kind === "rsc") return event.respondWith(networkFirst(event, req.url, null, NAV_TIMEOUT_MS));
    return event.respondWith(networkFirst(event, req.url, null, 0));
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AUDIO_CACHE: AUDIO_CACHE,
    SHELL_PREFIX: SHELL_PREFIX,
    MANIFEST_URL: MANIFEST_URL,
    versionFromUrl: versionFromUrl,
    shellCacheName: shellCacheName,
    isStaleCache: isStaleCache,
    pageKey: pageKey,
    classify: classify,
    extractStaticUrls: extractStaticUrls,
    extractLinkedFiles: extractLinkedFiles,
    parseRange: parseRange,
  };
}
