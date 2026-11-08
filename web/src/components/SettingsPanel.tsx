"use client";

import { useId, useState, type ReactNode } from "react";
import {
  DAILY_GOALS,
  progressStore,
  useProgress,
  type Settings,
} from "@/lib/progress";
import { playSfx } from "@/lib/sfx";
import { speak, useHasBengaliVoice } from "@/lib/speech";
import { AppShell } from "./AppShell";

function update(patch: Partial<Settings>) {
  progressStore.updateSettings(patch);
}

export function SettingsPanel() {
  const p = useProgress();
  const s = p.settings;
  const hasVoice = useHasBengaliVoice();

  return (
    <AppShell>
      <h1 className="text-3xl font-black">Settings</h1>
      <p className="mt-1 font-semibold text-muted">Saved on this device.</p>

      <div className="mt-6 flex flex-col gap-4">
        <Section id="goal" title="Daily goal" hint="How much XP you aim for each day. A lesson is worth 10 to 25 XP.">
          <Segmented
            label="Daily goal"
            value={s.dailyGoal}
            options={DAILY_GOALS.map((g) => ({
              value: g,
              label: `${g} XP`,
              sub: g === 10 ? "Easy" : g === 20 ? "Steady" : g === 30 ? "Keen" : "Intense",
            }))}
            onChange={(dailyGoal) => update({ dailyGoal })}
          />
        </Section>

        <Section
          title="Transliteration"
          hint="The romanized spelling under Bengali words, like “ami” under আমি."
        >
          <Segmented
            label="Transliteration"
            value={s.translit}
            options={[
              { value: "always", label: "Always", sub: "Always shown" },
              { value: "auto", label: "Fade out", sub: "Fades as you learn the script" },
              { value: "hidden", label: "Hidden", sub: "Tap to reveal" },
            ]}
            onChange={(translit) => update({ translit })}
          />
        </Section>

        <Section title="Sound">
          <Toggle
            label="Sound effects"
            sub="Chimes for right and wrong answers"
            checked={s.sound}
            onChange={(sound) => {
              update({ sound });
              if (sound) playSfx("correct");
            }}
          />
          <div className="mt-5">
            <p className="mb-2 font-extrabold">Bengali voice speed</p>
            <Segmented
              label="Bengali voice speed"
              value={s.ttsSpeed}
              options={[
                { value: "slow", label: "Slow" },
                { value: "normal", label: "Normal" },
                { value: "fast", label: "Fast" },
              ]}
              onChange={(ttsSpeed) => {
                update({ ttsSpeed });
                // Sample uses the language's own name, so no lesson text is hard-coded.
                speak("বাংলা");
              }}
            />
            <p className="mt-2 text-sm font-semibold text-muted">
              {hasVoice
                ? "Changing the speed plays a short sample."
                : "This device has no Bengali voice, so audio is unavailable. Listening exercises show the transliteration instead."}
            </p>
          </div>
        </Section>

        <ResetSection hasProgress={p.xp > 0 || Object.keys(p.completed).length > 0} />
      </div>
    </AppShell>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const hId = useId();
  return (
    <section id={id} aria-labelledby={hId} className="scroll-mt-24 rounded-3xl border-2 border-line bg-white p-5">
      <h2 id={hId} className="text-xl font-black">{title}</h2>
      {hint && <p className="mt-0.5 mb-4 text-sm font-semibold text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

/** Radio group styled as chunky segments. */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className={`grid gap-2 ${options.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={String(o.value)}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-b-4 px-2 py-3 text-center transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                on ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={on}
                onChange={() => onChange(o.value)}
              />
              <span className="font-extrabold">{o.label}</span>
              {o.sub && <span className={`text-xs font-semibold ${on ? "text-brand-dark" : "text-muted"}`}>{o.sub}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl text-left"
    >
      <span>
        <span className="block font-extrabold">{label}</span>
        {sub && <span className="block text-sm font-semibold text-muted">{sub}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-gray-300"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left] ${checked ? "left-7" : "left-1"}`}
        />
      </span>
    </button>
  );
}

function ResetSection({ hasProgress }: { hasProgress: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <Section title="Reset progress" hint="Erase XP, streak and finished lessons on this device. Your settings stay.">
      {done && !hasProgress ? (
        <p role="status" className="font-bold text-brand-dark">Progress erased. Fresh start.</p>
      ) : confirming ? (
        <div role="alertdialog" aria-labelledby="reset-q" className="rounded-2xl border-2 border-accent/30 bg-accent-light p-4">
          <p id="reset-q" className="font-extrabold text-accent-dark">
            Erase all progress? This can&apos;t be undone.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" autoFocus className="btn btn-ghost flex-1" onClick={() => setConfirming(false)}>
              Keep my progress
            </button>
            <button
              type="button"
              className="btn btn-danger flex-1"
              onClick={() => {
                progressStore.reset();
                setConfirming(false);
                setDone(true);
              }}
            >
              Erase progress
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost w-full text-accent-dark"
          disabled={!hasProgress}
          onClick={() => setConfirming(true)}
        >
          Reset progress
        </button>
      )}
    </Section>
  );
}
