"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cacheSupported, listCachedClips } from "@/lib/offline/audio-cache";
import { useInstalled, useOnline } from "@/lib/offline/hooks";
import { startOfflineWorker } from "@/lib/offline/register";

const HINT_KEY = "banglalingo.offline.hint";

/**
 * Mounted once from the root layout. Registers the service worker (production only, after load),
 * shows a small pill while offline, an "update ready" prompt, and, in the installed app only, a
 * dismissible link to the audio download page. Renders nothing otherwise.
 */
export function OfflineStatus() {
  return (
    <Suspense fallback={null}>
      <Status />
    </Suspense>
  );
}

function Status() {
  const online = useOnline();
  const installed = useInstalled();
  const pathname = usePathname();
  const [apply, setApply] = useState<(() => void) | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  // Only read once the installed-app hint could show (never during server render or hydration).
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [hasAudio, setHasAudio] = useState(true);

  useEffect(() => startOfflineWorker({ onUpdateReady: (fn) => setApply(() => fn) }), []);

  useEffect(() => {
    if (!cacheSupported()) return;
    let live = true;
    listCachedClips()
      .then((s) => live && setHasAudio(s.size > 0))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname]);

  const quietRoute = pathname.startsWith("/lesson/") || pathname === "/offline";
  const showHint = installed && online && !hasAudio && !hintDismissed && !quietRoute;
  const showUpdate = !!apply && !updateDismissed;

  return (
    <>
      {!online && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+2px)] z-[60] flex justify-center px-3"
        >
          <p className="animate-enter rounded-full border border-sun-edge/40 bg-sun-light px-3 text-center text-[0.6875rem] leading-4 font-extrabold text-sun-dark shadow-[var(--shadow-lift)]">
            You&rsquo;re offline &mdash; lessons you&rsquo;ve opened still work
          </p>
        </div>
      )}
      {(showUpdate || showHint) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[60] flex flex-col items-center gap-2 px-3 md:bottom-4">
          {showUpdate && (
            <div
              role="status"
              className="animate-enter pointer-events-auto flex items-center gap-2 rounded-full border-2 border-line-strong bg-surface py-1 pr-1 pl-4 text-sm font-extrabold shadow-[var(--shadow-lift)]"
            >
              <span>New version available</span>
              <button type="button" className="btn btn-primary btn-sm !min-h-8 !px-3 !py-1 !text-sm" onClick={() => apply?.()}>
                Refresh
              </button>
              <button
                type="button"
                aria-label="Dismiss"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunk"
                onClick={() => setUpdateDismissed(true)}
              >
                <span aria-hidden>&times;</span>
              </button>
            </div>
          )}
          {showHint && (
            <div className="animate-enter pointer-events-auto flex items-center gap-1 rounded-full border-2 border-line bg-surface py-1 pr-1 pl-4 text-sm font-extrabold shadow-[var(--shadow-lift)]">
              <Link href="/offline" className="text-brand-dark underline">
                Download audio for offline
              </Link>
              <button
                type="button"
                aria-label="Dismiss"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-sunk"
                onClick={() => {
                  setHintDismissed(true);
                  try {
                    localStorage.setItem(HINT_KEY, "1");
                  } catch {
                    // ignore
                  }
                }}
              >
                <span aria-hidden>&times;</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
