"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { celebrate } from "@/lib/celebrate";
import type { Achievement } from "@/lib/profile";
import { playSfx } from "@/lib/sfx";
import { Badge } from "./Badge";

const SEEN_KEY = "banglalingo.badges-seen.v1";

/**
 * Badges earned since the last visit to this page. The first visit ever records what is already
 * earned without a fuss; later visits celebrate anything new, once.
 */
function useNewBadges(list: Achievement[]): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const earnedKey = list.filter((a) => a.earned).map((a) => a.id).join(",");
  useEffect(() => {
    const earned = earnedKey ? earnedKey.split(",") : [];
    let seen: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      seen = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return;
    }
    const isNew = seen ? earned.filter((id) => !seen!.includes(id)) : [];
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...(seen ?? []), ...earned])]));
    } catch {
      // storage blocked: no celebration bookkeeping
    }
    if (!isNew.length) return;
    // A one-off reaction to something that happened outside React (the stored list).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFresh(new Set(isNew));
    playSfx("chest");
    celebrate("big");
  }, [earnedKey]);
  return fresh;
}

/** Badge grid: earned ones in thread colours, locked ones grey with what is still needed. */
export function Achievements({ list }: { list: Achievement[] }) {
  const earned = list.filter((a) => a.earned).length;
  const fresh = useNewBadges(list);
  return (
    <section aria-labelledby="ach-h" className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ach-h" className="text-xl font-black">
          Achievements
        </h2>
        <p className="text-sm font-bold text-muted">
          {earned} of {list.length} earned
        </p>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 min-[440px]:grid-cols-3 sm:grid-cols-4">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col items-center text-center">
            <motion.div
              className={`relative ${a.earned ? "" : "opacity-90"}`}
              animate={fresh.has(a.id) ? { scale: [0.4, 1.25, 1], rotate: [-20, 8, 0] } : undefined}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            >
              <Badge motif={a.motif} tone={a.tone} tier={a.tier} earned={a.earned} />
              {fresh.has(a.id) && <span className="chip absolute -top-2 -right-3 bg-accent text-white">New</span>}
            </motion.div>
            <p className={`mt-1.5 leading-tight font-black ${a.earned ? "text-ink" : "text-muted"}`}>
              {a.title}
              <span className="sr-only">{a.earned ? ", earned" : ", locked"}</span>
            </p>
            <p className="mt-0.5 max-w-[11rem] text-xs leading-snug font-semibold text-muted">
              {a.goal}
            </p>
            {!a.earned && (
              <div className="mt-2 w-full max-w-[8.5rem]">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-sunk"
                  role="progressbar"
                  aria-label={`${a.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={a.target}
                  aria-valuenow={a.value}
                  aria-valuetext={a.progressText}
                >
                  <div
                    className="h-full rounded-full bg-muted/60"
                    style={{ width: `${a.target ? Math.round((a.value / a.target) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.6875rem] leading-tight font-bold text-muted">{a.progressText}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
