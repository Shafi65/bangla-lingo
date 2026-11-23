"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SpeakButton } from "@/components/SpeakButton";
import { useProgress, useWordMemory } from "@/lib/progress";
import { useNow } from "@/lib/review";
import { layoutSky, LEVEL_TEXT, SKY_WIDTH, specks, starDue, starLevel, type PlacedStar, type StarLevel } from "@/lib/stars/sky";
import type { WriteGroup } from "@/lib/write/letters";
import { useWriteProgress } from "@/lib/write/storage";

const R: Record<StarLevel, number> = { 0: 2.2, 1: 3.6, 2: 5, 3: 6.4 };
const FILL: Record<StarLevel, string> = { 0: "#5b6b86", 1: "#cfd8ea", 2: "#ffe08a", 3: "#ffb300" };

/** Four-point sparkle path centred on (0,0). */
const sparkle = (r: number) => `M0 ${-r * 2.2}Q${r * 0.35} ${-r * 0.35} ${r * 2.2} 0Q${r * 0.35} ${r * 0.35} 0 ${r * 2.2}Q${-r * 0.35} ${r * 0.35} ${-r * 2.2} 0Q${-r * 0.35} ${-r * 0.35} 0 ${-r * 2.2}Z`;

export function NightSky({ groups }: { groups: WriteGroup[] }) {
  const progress = useProgress();
  const memory = useWordMemory();
  const write = useWriteProgress();
  // 0 on the server and during hydration: every star starts dark, then lights up.
  const clock = useNow();
  const now = clock > 0 ? clock : null;
  const [picked, setPicked] = useState<PlacedStar | null>(null);

  const { constellations, height } = useMemo(() => layoutSky(groups), [groups]);
  const dust = useMemo(() => specks(height), [height]);

  // Each star's brightness, worked out once per change of progress, memory, writing or clock.
  const states = useMemo(() => {
    const out = new Map<string, { level: StarLevel; due: boolean }>();
    for (const s of constellations.flatMap((c) => c.stars)) {
      const rec = memory.words[s.letter.id];
      const level = now === null ? 0 : starLevel({ lessonDone: !!progress.completed[s.lessonId], write: write.letters[s.letter.id] ?? "new", memory: rec, now });
      out.set(s.letter.id, { level, due: now !== null && level > 0 && starDue(rec, now) });
    }
    return out;
  }, [constellations, memory, progress.completed, write, now]);
  const info = (s: PlacedStar) => states.get(s.letter.id) ?? { level: 0 as StarLevel, due: false };

  const pickedInfo = picked ? info(picked) : null;
  const counts = [0, 0, 0, 0];
  for (const st of states.values()) counts[st.level]++;
  const lit = states.size - counts[0];

  return (
    <AppShell>
      <h1 className="text-2xl font-black text-balance">The letter sky</h1>
      <p className="mt-1 font-semibold text-muted">
        Every Bengali letter is a star. It lights up when you meet it in a lesson, and shines brighter as you learn it, trace it and write it from memory.
        A star that flickers is due for review.
      </p>
      <p className="mt-3 font-black text-ink" aria-live="polite">
        {lit} of {states.size} stars lit · {counts[3]} mastered
      </p>

      <div className="relative mt-4 overflow-hidden rounded-[var(--radius-card)] bg-[#0b1430] shadow-inner" style={{ backgroundImage: "radial-gradient(120% 60% at 50% 0%, #1d2c5c 0%, #0b1430 70%)" }}>
        <svg viewBox={`0 0 ${SKY_WIDTH} ${height}`} className="block w-full" role="group" aria-label="Letter sky">
          <g aria-hidden>
            {dust.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#fff" opacity={0.25 + (i % 5) * 0.08} />
            ))}
          </g>
          {constellations.map((c) => (
            <g key={c.id}>
              <text x={16} y={c.y + 12} fill="#9fb0d6" fontSize="12" fontWeight="800" letterSpacing="0.06em">
                {c.title.toUpperCase()}
              </text>
              <g aria-hidden>
                {c.links.map(([a, b]) => {
                  const on = info(c.stars[a]).level > 0 && info(c.stars[b]).level > 0;
                  return (
                    <motion.line
                      key={`${a}-${b}`}
                      x1={c.stars[a].x}
                      y1={c.stars[a].y}
                      x2={c.stars[b].x}
                      y2={c.stars[b].y}
                      stroke={on ? "#ffe08a" : "#33406a"}
                      strokeWidth={on ? 1.2 : 0.8}
                      strokeDasharray={on ? undefined : "2 3"}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: on ? 0.55 : 0.6 }}
                      transition={{ duration: 0.8, delay: 0.2 + a * 0.02 }}
                    />
                  );
                })}
              </g>
              {c.stars.map((s, i) => {
                const { level, due } = info(s);
                const r = R[level];
                return (
                  <g
                    key={s.letter.id}
                    transform={`translate(${s.x} ${s.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.letter.glyph}, ${s.letter.tr}: ${LEVEL_TEXT[level]}${due ? ", due for review" : ""}`}
                    onClick={() => setPicked(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPicked(s);
                      }
                    }}
                    className="cursor-pointer outline-none [&:focus-visible_.ring]:opacity-100"
                  >
                    <circle r={18} fill="transparent" />
                    <circle className="ring" r={15} fill="none" stroke="#fff" strokeWidth={1.5} opacity={picked?.letter.id === s.letter.id ? 0.9 : 0} />
                    {level >= 2 && <circle r={r * 2.6} fill={FILL[level]} opacity={0.16} />}
                    <motion.path
                      d={sparkle(r)}
                      fill={FILL[level]}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={
                        due
                          ? { scale: 1, opacity: [1, 0.35, 1] }
                          : { scale: 1, opacity: 1, rotate: level === 3 ? [0, 8, 0] : 0 }
                      }
                      transition={
                        due
                          ? { scale: { delay: 0.1 + i * 0.015 }, opacity: { duration: 1.8, repeat: Infinity, delay: (i % 7) * 0.2 } }
                          : { delay: 0.1 + i * 0.015, type: "spring", stiffness: 260, damping: 16, rotate: { duration: 3, repeat: Infinity, delay: i * 0.1 } }
                      }
                    />
                    <text
                      y={r * 2.2 + 13}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="700"
                      lang="bn"
                      fill={level === 0 ? "#6b7aa0" : "#e8eefc"}
                      className="font-bengali"
                      aria-hidden
                    >
                      {s.letter.glyph}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold text-muted sm:grid-cols-4" aria-label="Key">
        {([0, 1, 2, 3] as StarLevel[]).map((l) => (
          <li key={l} className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden className="rounded-md bg-[#0b1430]">
              <path d={sparkle(R[l] * 0.8)} fill={FILL[l]} />
            </svg>
            {LEVEL_TEXT[l]} ({counts[l]})
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {picked && pickedInfo && (
          <motion.section
            key={picked.letter.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="card mt-5 flex items-center gap-4 p-4"
            aria-live="polite"
          >
            <span lang="bn" className="font-bengali text-5xl leading-none font-bold text-ink">
              {picked.letter.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black text-ink">
                {picked.letter.tr} <span className="font-semibold text-muted">· {picked.letter.en}</span>
              </p>
              <p className="text-sm font-bold text-muted">
                {LEVEL_TEXT[pickedInfo.level]}
                {pickedInfo.due ? " · due for review" : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm font-extrabold">
                <Link href="/write" className="text-brand-dark underline">
                  Trace it
                </Link>
                <Link href={`/lesson/${picked.lessonId}`} className="text-brand-dark underline">
                  Open its lesson
                </Link>
                {pickedInfo.due && (
                  <Link href="/practice" className="text-brand-dark underline">
                    Review
                  </Link>
                )}
              </div>
            </div>
            <SpeakButton bn={picked.letter.speak} />
          </motion.section>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
