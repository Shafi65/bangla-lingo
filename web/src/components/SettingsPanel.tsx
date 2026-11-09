"use client";

import { useId, useState, type ReactNode } from "react";
import {
  DAILY_GOALS,
  progressStore,
  useProgress,
  type Settings,
  type TtsSpeed,
} from "@/lib/progress";
import { playSfx } from "@/lib/sfx";
import {
  recordedClipCount,
  speak,
  useCanSpeak,
  useDeviceVoice,
} from "@/lib/speech";
import { AppShell } from "./AppShell";

// The language's own name, so no lesson text is hard-coded. Also listed in
// content/scripts/gen-audio.mjs (APP_STRINGS) so it gets a recorded clip.
const VOICE_SAMPLE = "বাংলা";

function update(patch: Partial<Settings>) {
  progressStore.updateSettings(patch);
}

export function SettingsPanel() {
  const p = useProgress();
  const s = p.settings;

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
        </Section>

        <AudioSection
          speed={s.ttsSpeed}
          onSpeed={(ttsSpeed) => {
            update({ ttsSpeed });
            speak(VOICE_SAMPLE);
          }}
        />

        <ResetSection hasProgress={p.xp > 0 || Object.keys(p.completed).length > 0} />
      </div>
    </AppShell>
  );
}

const VOICE_HELP: { platform: string; steps: string }[] = [
  {
    platform: "Mac",
    steps:
      "System Settings → Accessibility → Spoken Content → System voice → Manage Voices… → find Bangla and download a voice. Then restart your browser.",
  },
  {
    platform: "iPhone / iPad",
    steps: "Settings → Accessibility → Spoken Content → Voices → Bangla → download a voice.",
  },
  {
    platform: "Android",
    steps:
      "Settings → search “Text-to-speech” → Speech Services by Google → settings → Install voice data → Bengali (Bangladesh).",
  },
  {
    platform: "Windows",
    steps:
      "Windows doesn’t generally offer a Bengali voice, so audio there needs the app’s recorded clips.",
  },
];

function AudioSection({
  speed,
  onSpeed,
}: {
  speed: TtsSpeed;
  onSpeed: (v: TtsSpeed) => void;
}) {
  const voice = useDeviceVoice();
  const can = useCanSpeak(VOICE_SAMPLE);
  const [tested, setTested] = useState<null | "played" | "none">(null);

  return (
    <Section id="audio" title="Audio" hint="How Bengali words are spoken in lessons.">
      <ul className="flex flex-col gap-2 text-sm font-semibold" aria-label="Audio status">
        <StatusRow ok={recordedClipCount > 0} label="Recorded audio">
          {recordedClipCount > 0
            ? `${recordedClipCount} clips available`
            : "Not available yet (coming soon)"}
        </StatusRow>
        {recordedClipCount > 0 && (
          <li className="text-xs font-semibold text-muted">
            Recorded clips use a computer-generated Bangladeshi Bengali voice.
          </li>
        )}
        <StatusRow ok={!!voice} label="Device voice">
          {voice
            ? `${voice.name} (${voice.lang})`
            : can === "pending"
              ? "Checking…"
              : "No Bengali voice detected"}
        </StatusRow>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={can === "no"}
          onClick={() => setTested(speak(VOICE_SAMPLE) ? "played" : "none")}
        >
          Test voice
        </button>
        <span role="status" className="text-sm font-semibold text-muted">
          {tested === "played"
            ? "Playing “বাংলা” (bangla). Didn’t hear it? Check your volume."
            : tested === "none" || can === "no"
              ? "No Bengali audio on this device yet. Listening exercises show the transliteration instead."
              : ""}
        </span>
      </div>

      <div className="mt-5">
        <p className="mb-2 font-extrabold">Bengali voice speed</p>
        <Segmented
          label="Bengali voice speed"
          value={speed}
          options={[
            { value: "slow", label: "Slow" },
            { value: "normal", label: "Normal" },
            { value: "fast", label: "Fast" },
          ]}
          onChange={onSpeed}
        />
        <p className="mt-2 text-sm font-semibold text-muted">Changing the speed plays a short sample.</p>
      </div>

      <details className="mt-5 rounded-2xl bg-paper p-4" open={can === "no" || undefined}>
        <summary className="cursor-pointer font-extrabold">Install a Bengali voice on your device</summary>
        <p className="mt-2 text-sm font-semibold text-muted">
          Recorded audio for every word is coming. Until then, a voice installed on your device can
          speak Bengali in the app.
        </p>
        <dl className="mt-3 flex flex-col gap-3 text-sm">
          {VOICE_HELP.map((h) => (
            <div key={h.platform}>
              <dt className="font-extrabold">{h.platform}</dt>
              <dd className="font-semibold text-muted">{h.steps}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Section>
  );
}

function StatusRow({ ok, label, children }: { ok: boolean; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${ok ? "bg-brand" : "bg-gray-300"}`}
      />
      <span>
        <span className="font-extrabold text-ink">{label}:</span> {children}
        <span className="sr-only">{ok ? " (on)" : " (off)"}</span>
      </span>
    </li>
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
