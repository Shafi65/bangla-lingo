"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DAILY_GOALS, progressStore, useProgress, type DailyGoal, type TranslitMode } from "@/lib/progress";
import {
  LEVELS,
  PLACEMENT_TEST_HREF,
  REASONS,
  REASON_LABELS,
  clearOnboarding,
  resolveStartLesson,
  writeOnboarding,
  type KnownLevel,
  type Reason,
  type StartPoint,
} from "@/lib/onboarding";
import { useOnboarding } from "@/lib/onboarding/useOnboarding";
import { CheckIcon } from "../icons";
import { Logo } from "../Logo";
import { SpeakButton } from "../SpeakButton";
import { Choice } from "./Choice";

const STEPS = ["hello", "why", "start", "plan", "done"] as const;
type Step = (typeof STEPS)[number];

const GOAL_SUB: Record<DailyGoal, string> = {
  10: "About one lesson",
  20: "One or two lessons",
  30: "Two or three lessons",
  50: "A serious session",
};

const TRANSLIT_OPTIONS: { value: TranslitMode; title: string; sub: string }[] = [
  { value: "always", title: "Always show it", sub: "Romanized Bengali under every word" },
  { value: "auto", title: "Fade it as I learn", sub: "Quieter once you start the alphabet" },
  { value: "hidden", title: "Hide it", sub: "Tap to peek when you need it" },
];

export function OnboardingFlow({
  unit1LessonId,
  alphabetLessonId,
  hasAlphabet,
}: {
  unit1LessonId?: string;
  alphabetLessonId?: string;
  hasAlphabet: boolean;
}) {
  const router = useRouter();
  const settings = useProgress().settings;
  const stored = useOnboarding();
  const uid = useId();

  const [i, setI] = useState(0);
  const [reason, setReason] = useState<Reason | undefined>();
  const [level, setLevel] = useState<KnownLevel | undefined>();
  const [startAt, setStartAt] = useState<StartPoint | undefined>();
  const [goalPick, setGoalPick] = useState<DailyGoal | undefined>();
  const [translitPick, setTranslitPick] = useState<TranslitMode | undefined>();

  const step: Step = STEPS[i];
  const goal = goalPick ?? settings.dailyGoal;
  const translit = translitPick ?? settings.translit;
  const startPoint: StartPoint | undefined = level === "new" ? "lesson" : startAt;
  const startId = resolveStartLesson(level, startPoint, { unit1LessonId, alphabetLessonId });

  // Move focus to the new screen's heading (not on first load) so screen readers announce it.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [i]);

  const save = (skipped: boolean) =>
    writeOnboarding({
      completed: true,
      skipped,
      completedAt: new Date().toISOString(),
      reason,
      level,
      startAt: startPoint,
    });

  // Reaching the last screen counts as finishing, whichever button they press next.
  useEffect(() => {
    if (step === "done") save(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const next = () => {
    if (step === "plan") progressStore.updateSettings({ dailyGoal: goal, translit });
    setI((n) => Math.min(n + 1, STEPS.length - 1));
  };
  const back = () => setI((n) => Math.max(n - 1, 0));
  const skip = () => {
    save(true);
    router.push("/");
  };
  const restart = () => {
    clearOnboarding();
    setReason(undefined);
    setLevel(undefined);
    setStartAt(undefined);
    setI(0);
  };

  const needsStart = step === "start" && (!level || (level === "some" && !startAt));

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className={`flex h-10 w-[5.5rem] whitespace-nowrap items-center justify-start rounded-xl pl-2 text-muted hover:bg-sunk hover:text-ink ${
            i === 0 ? "invisible" : ""
          }`}
          disabled={i === 0}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          role="progressbar"
          aria-label="Intro progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={i + 1}
          aria-valuetext={`Step ${i + 1} of ${STEPS.length}`}
          className="flex flex-1 justify-center gap-1.5"
        >
          {STEPS.map((s, n) => (
            <span
              key={s}
              aria-hidden
              className={`h-1.5 w-9 rounded-full transition-colors ${n <= i ? "bg-brand" : "bg-line-strong"}`}
            />
          ))}
        </div>
        {step !== "done" ? (
          <button
            type="button"
            onClick={skip}
            className="h-10 w-[5.5rem] whitespace-nowrap rounded-xl px-1 text-right text-sm font-extrabold text-muted hover:bg-sunk hover:text-ink"
          >
            Skip intro
          </button>
        ) : (
          <span className="w-[5.5rem] whitespace-nowrap" aria-hidden />
        )}
      </header>

      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-4 pb-6">
        <div key={step} className="animate-rise flex flex-1 flex-col gap-5">
          {step === "hello" && <HelloStep headingRef={headingRef} />}
          {step === "why" && (
            <Question headingRef={headingRef} id={`${uid}-why`} title="What brings you to Bengali?" hint="Optional. It stays on this device.">
              <div role="radiogroup" aria-labelledby={`${uid}-why`} className="flex flex-col gap-3">
                {REASONS.map((r) => (
                  <Choice
                    key={r}
                    name={`${uid}-why`}
                    value={r}
                    checked={reason === r}
                    onSelect={(v) => setReason(v as Reason)}
                    title={REASON_LABELS[r].title}
                    sub={REASON_LABELS[r].sub}
                    compact
                  />
                ))}
              </div>
            </Question>
          )}
          {step === "start" && (
            <Question headingRef={headingRef} id={`${uid}-start`} title="Where should we begin?">
              <div role="radiogroup" aria-labelledby={`${uid}-start`} className="flex flex-col gap-3">
                {LEVELS.map((l) => (
                  <Choice
                    key={l}
                    name={`${uid}-start`}
                    value={l}
                    checked={level === l}
                    onSelect={(v) => setLevel(v as KnownLevel)}
                    title={l === "new" ? "I'm new to Bengali" : "I know some already"}
                    sub={l === "new" ? "Start with the first lesson" : "Pick a starting point"}
                  />
                ))}
              </div>
              {level === "some" && (
                <div className="animate-rise mt-5 flex flex-col gap-3">
                  <p className="rounded-2xl bg-sun-light px-4 py-3 text-sm font-bold text-sun-dark" role="note">
                    A placement test is coming soon.
                    {PLACEMENT_TEST_HREF && (
                      <>
                        {" "}
                        <Link href={PLACEMENT_TEST_HREF} className="underline">
                          Take it now
                        </Link>
                      </>
                    )}{" "}
                    Until then, choose where to start. You can always change course from the map.
                  </p>
                  <p id={`${uid}-at`} className="font-extrabold">
                    Start at
                  </p>
                  <div role="radiogroup" aria-labelledby={`${uid}-at`} className="flex flex-col gap-3">
                    {hasAlphabet && (
                      <Choice
                        name={`${uid}-at`}
                        value="alphabet"
                        checked={startAt === "alphabet"}
                        onSelect={(v) => setStartAt(v as StartPoint)}
                        title="The alphabet"
                        sub="Learn to read the script first"
                        compact
                      />
                    )}
                    <Choice
                      name={`${uid}-at`}
                      value="unit1"
                      checked={startAt === "unit1"}
                      onSelect={(v) => setStartAt(v as StartPoint)}
                      title="Unit 1"
                      sub="Greetings and first words"
                      compact
                    />
                  </div>
                </div>
              )}
            </Question>
          )}
          {step === "plan" && (
            <PlanStep
              headingRef={headingRef}
              uid={uid}
              goal={goal}
              onGoal={setGoalPick}
              translit={translit}
              onTranslit={setTranslitPick}
            />
          )}
          {step === "done" && (
            <DoneStep headingRef={headingRef} goal={goal} startAlphabet={startPoint === "alphabet"} />
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {step === "done" ? (
            <>
              {startId && (
                <Link href={`/lesson/${startId}`} className="btn btn-primary w-full">
                  {startPoint === "alphabet" ? "Start the alphabet" : "Start the first lesson"}
                </Link>
              )}
              <Link href="/" className="btn btn-ghost w-full">
                Go to the map
              </Link>
            </>
          ) : (
            <button type="button" onClick={next} disabled={needsStart} className="btn btn-primary w-full">
              {step === "hello" ? "Get started" : "Continue"}
            </button>
          )}
          {step === "hello" && stored?.completed && (
            <button
              type="button"
              onClick={restart}
              className="self-center rounded-lg px-2 py-1 text-sm font-bold text-muted underline"
            >
              Restart intro
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Heading({
  headingRef,
  id,
  children,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  id?: string;
  children: ReactNode;
}) {
  return (
    <h1
      id={id}
      ref={headingRef}
      tabIndex={-1}
      className="text-3xl leading-tight font-black text-balance text-ink outline-none"
    >
      {children}
    </h1>
  );
}

function Question({
  headingRef,
  id,
  title,
  hint,
  children,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div>
        <Heading headingRef={headingRef} id={id}>
          {title}
        </Heading>
        {hint && <p className="mt-1 font-semibold text-muted">{hint}</p>}
      </div>
      <div>{children}</div>
    </>
  );
}

function HelloStep({ headingRef }: { headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <Logo size={44} />
        <span className="text-xl font-black tracking-tight text-brand-dark">BanglaLingo</span>
      </div>
      <Heading headingRef={headingRef}>A free course in the Bengali spoken in Bangladesh</Heading>
      <p className="font-semibold text-muted">
        Short lessons, a few minutes a day. You will read, hear and say real phrases from the start.
      </p>

      <section aria-label="Say hello" className="flex flex-col gap-3">
        <div
          className="kantha-edge flex items-center gap-4 rounded-[var(--radius-panel)] bg-brand-light p-6"
          style={{ ["--stitch" as string]: "color-mix(in oklab, var(--color-brand) 45%, transparent)" }}
        >
          <div className="min-w-0 flex-1">
            <p lang="bn" className="bn-display text-[1.75rem] leading-tight font-bold text-brand-dark">
              আসসালামু আলাইকুম
            </p>
            <p className="font-bold text-ink italic">assalamu alaikum</p>
            <p className="text-sm font-semibold text-muted">The everyday hello in Bangladesh</p>
          </div>
          <SpeakButton bn="আসসালামু আলাইকুম" />
        </div>
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border-2 border-line bg-surface px-5 py-3">
          <div className="min-w-0 flex-1">
            <p lang="bn" className="bn-display text-xl font-bold text-ink">
              নমস্কার
            </p>
            <p className="text-sm font-semibold text-muted">
              <span className="italic">nomoshkar</span>, the Hindu greeting
            </p>
          </div>
          <SpeakButton bn="নমস্কার" />
        </div>
      </section>
    </>
  );
}

function PlanStep({
  headingRef,
  uid,
  goal,
  onGoal,
  translit,
  onTranslit,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  uid: string;
  goal: DailyGoal;
  onGoal: (g: DailyGoal) => void;
  translit: TranslitMode;
  onTranslit: (t: TranslitMode) => void;
}) {
  return (
    <>
      <Heading headingRef={headingRef}>Set your pace</Heading>
      <section>
        <h2 id={`${uid}-goal`} className="mb-2 font-extrabold">
          Daily goal
        </h2>
        <div role="radiogroup" aria-labelledby={`${uid}-goal`} className="grid grid-cols-2 gap-3">
          {DAILY_GOALS.map((g) => (
            <Choice
              key={g}
              name={`${uid}-goal`}
              value={String(g)}
              checked={goal === g}
              onSelect={() => onGoal(g)}
              title={`${g} XP`}
              sub={GOAL_SUB[g]}
              compact
            />
          ))}
        </div>
      </section>
      <section>
        <h2 id={`${uid}-tr`} className="mb-2 font-extrabold">
          Romanization (Bengali in English letters)
        </h2>
        <div role="radiogroup" aria-labelledby={`${uid}-tr`} className="flex flex-col gap-3">
          {TRANSLIT_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              name={`${uid}-tr`}
              value={o.value}
              checked={translit === o.value}
              onSelect={(v) => onTranslit(v as TranslitMode)}
              title={o.title}
              sub={o.sub}
              compact
            />
          ))}
        </div>
        <TranslitPreview mode={translit} />
      </section>
    </>
  );
}

function TranslitPreview({ mode }: { mode: TranslitMode }) {
  return (
    <p className="mt-3 flex items-baseline gap-3 rounded-2xl bg-sunk px-4 py-2" aria-live="polite">
      <span lang="bn" className="text-xl font-bold">
        ধন্যবাদ
      </span>
      {mode === "always" && <span className="font-semibold text-muted italic">dhonnobad</span>}
      {mode === "auto" && <span className="font-semibold text-muted/70 italic">dhonnobad</span>}
      {mode === "hidden" && <span className="translit-reveal">Show pronunciation</span>}
      <span className="ml-auto text-sm font-semibold text-muted">thank you</span>
    </p>
  );
}

function DoneStep({
  headingRef,
  goal,
  startAlphabet,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  goal: DailyGoal;
  startAlphabet: boolean;
}) {
  return (
    <>
      <div
        aria-hidden
        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-white"
        style={{ boxShadow: "0 5px 0 var(--color-brand-edge)" }}
      >
        <CheckIcon />
      </div>
      <div>
        <Heading headingRef={headingRef}>You are all set</Heading>
        <p className="mt-2 font-semibold text-muted">
          Your goal is {goal} XP a day, and you will begin with {startAlphabet ? "the alphabet" : "your first lesson"}.
          Change either any time in Settings.
        </p>
      </div>
    </>
  );
}
