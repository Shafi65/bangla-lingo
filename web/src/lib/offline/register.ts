// Browser-only: registers the service worker (production builds only) and reports updates.
import { PRECACHE_MANIFEST_URL, SW_PATH, swUrl } from "./cache-names";

export interface RegisterHandlers {
  /** A new worker finished installing and is waiting for the user to refresh. */
  onUpdateReady: (apply: () => void) => void;
}

const RECHECK_MS = 10 * 60 * 1000;

/** Production only: dev builds must never be cached, so any old worker is removed instead. */
export const swEnabled = () => process.env.NODE_ENV === "production";

/**
 * Registers /sw.js?b=<build id> after the page has loaded and the browser is idle, so it never
 * competes with first render. Returns a cleanup function.
 */
export function startOfflineWorker(handlers: RegisterHandlers): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const sw = navigator.serviceWorker;

  if (!swEnabled()) {
    sw.getRegistrations?.().then((rs) => rs.filter((r) => r.active?.scriptURL.includes(SW_PATH)).forEach((r) => r.unregister())).catch(() => {});
    return () => {};
  }

  let cancelled = false;
  let announced = false;
  let last = 0;
  let reloading = false;

  const announce = (reg: ServiceWorkerRegistration) => {
    // Only an update (there is already a controller) needs a prompt; a first install claims the page itself.
    if (announced || !reg.waiting || !sw.controller) return;
    announced = true;
    handlers.onUpdateReady(() => {
      sw.addEventListener(
        "controllerchange",
        () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        },
        { once: true },
      );
      reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  };

  const watch = (reg: ServiceWorkerRegistration) => {
    announce(reg);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed") announce(reg);
      });
    });
  };

  const check = async () => {
    if (cancelled || Date.now() - last < RECHECK_MS / 2) return;
    last = Date.now();
    try {
      const res = await fetch(PRECACHE_MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = (await res.json()) as { buildId?: string };
      if (cancelled || typeof buildId !== "string") return;
      watch(await sw.register(swUrl(buildId), { scope: "/" }));
    } catch {
      // Offline or blocked: keep whatever worker is already installed.
      const existing = await sw.getRegistration("/").catch(() => undefined);
      if (existing) watch(existing);
    }
  };

  const idle = (fn: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500);
  const start = () => idle(() => void check());
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("load", start);
  };
}
