"use client";

import { useState } from "react";
import { Translit } from "@/components/Translit";
import { maskedTranslit, splitAtBlank } from "@/lib/fillBlank";
import type { FillBlankExercise } from "@/lib/types";
import { useLessonEnv } from "../LessonEnv";
import { Choices } from "./Choices";
import { TypingHelp } from "./TypeTranslation";
import type { ExerciseProps } from "./types";

/**
 * A Bengali sentence with one gap; the English meaning sits underneath as the
 * cue. Transliteration follows the display setting but has the blank's
 * romanisation masked (or is withheld) until the answer is checked.
 */
export function FillBlank({ ex, locked, onChange, onSubmit }: ExerciseProps<FillBlankExercise>) {
  const { scriptTrack } = useLessonEnv();
  const choice = ex.options !== undefined;
  const parts = splitAtBlank(ex.sentence.bn, ex.blank) ?? { before: ex.sentence.bn, after: "" };
  const [picked, setPicked] = useState<number | null>(null); // original option index
  const [typed, setTyped] = useState("");

  const filled = locked ? ex.blank : choice ? (picked !== null ? ex.options![picked] : undefined) : typed.trim() ? typed : undefined;
  const tr = locked ? ex.sentence.tr : maskedTranslit(ex.sentence, ex.blank);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">{choice ? "Fill in the blank" : "Type the missing word"}</h2>
      <div className="card flex flex-col gap-2 p-4">
        <p lang="bn" className="text-3xl leading-relaxed font-bold text-pretty text-ink [overflow-wrap:anywhere]">
          {parts.before}
          <Gap text={filled} state={locked ? "done" : filled ? "filled" : "empty"} bn={choice} />
          {parts.after}
        </p>
        {tr && (
          <div className="text-sm font-semibold">
            <Translit tr={tr} />
          </div>
        )}
        <p className="text-lg font-semibold text-pretty text-muted">“{ex.sentence.en}”</p>
      </div>
      {choice ? (
        <Choices
          options={ex.options!}
          bengali
          translit={scriptTrack ? "after" : "always"}
          locked={locked}
          onChange={(r) => {
            setPicked(r?.kind === "index" ? r.value : null);
            onChange(r);
          }}
          answer={ex.answer}
        />
      ) : (
        <>
          <input
            type="text"
            value={typed}
            readOnly={locked}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            lang="bn"
            placeholder="Bengali or transliteration"
            aria-label="Your answer"
            onChange={(e) => {
              setTyped(e.target.value);
              onChange(e.target.value.trim() ? { kind: "text", value: e.target.value } : null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="focus-border w-full rounded-[var(--radius-card)] border-2 border-line-strong bg-sunk p-4 text-xl font-semibold text-ink transition-colors outline-none placeholder:text-muted/80 focus:border-brand focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_22%,transparent)] focus-visible:outline-none read-only:cursor-default"
          />
          <TypingHelp />
        </>
      )}
    </div>
  );
}

function Gap({ text, state, bn }: { text?: string; state: "empty" | "filled" | "done"; bn: boolean }) {
  const tone =
    state === "done"
      ? "border-brand bg-brand-light text-brand-dark"
      : state === "filled"
        ? "border-brand bg-sunk text-brand-dark"
        : "border-line-strong bg-sunk text-transparent";
  return (
    <span
      role="img"
      aria-label={text ? `blank: ${text}` : "blank"}
      lang={bn ? "bn" : undefined}
      className={`bn-display mx-1.5 inline-block min-w-[4.5rem] rounded-md border-b-4 px-2 text-center align-baseline ${tone}`}
    >
      {text ?? "\u00a0"}
    </span>
  );
}
