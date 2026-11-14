"use client";

import { useId, useState } from "react";
import { BnText } from "@/components/BnText";
import type { TypeTranslationExercise } from "@/lib/types";
import type { ExerciseProps } from "./types";

export function TypeTranslation({
  ex,
  locked,
  onChange,
  onSubmit,
}: ExerciseProps<TypeTranslationExercise>) {
  const [value, setValue] = useState("");
  const bnToEn = ex.direction === "bn_to_en";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">
        {bnToEn ? "Translate into English" : "Write this in Bengali"}
      </h2>
      {bnToEn ? (
        <BnText text={ex.prompt} size="lg" />
      ) : (
        <p className="text-3xl font-bold">“{ex.prompt.en}”</p>
      )}
      <textarea
        value={value}
        readOnly={locked}
        autoFocus
        rows={3}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        lang={bnToEn ? "en" : "bn"}
        placeholder={
          bnToEn ? "Type in English" : "Type in Bengali script or transliteration"
        }
        aria-label="Your answer"
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value.trim() ? { kind: "text", value: e.target.value } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        className={`focus-border w-full resize-none rounded-[var(--radius-card)] border-2 border-line-strong bg-sunk p-4 text-xl font-semibold text-ink transition-colors outline-none placeholder:text-muted/80 focus:border-brand focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-brand)_22%,transparent)] focus-visible:outline-none read-only:cursor-default ${
          bnToEn ? "" : "font-bengali"
        }`}
      />
      {!bnToEn && <TypingHelp />}
    </div>
  );
}

/** Optional help for typing Bengali; closed by default so it never gives answers away. */
function TypingHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="-mt-3 text-sm font-semibold text-muted">
      <p>
        Romanized spelling like “dhonnobad” is accepted too.{" "}
        <button
          type="button"
          data-enter-native
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="rounded font-extrabold text-brand-dark underline decoration-2 underline-offset-2"
        >
          {open ? "Hide typing help" : "Typing help"}
        </button>
      </p>
      {open && (
        <ul id={id} className="animate-rise mt-2 list-disc space-y-1 rounded-2xl bg-sunk py-3 pr-3 pl-8">
          <li>Write it the way it sounds: “a” as in father, “o” for the short <span lang="bn">অ</span> sound.</li>
          <li>Capitals, punctuation and extra spaces are ignored.</li>
          <li>
            For Bengali script, add a Bengali keyboard in your device settings; phonetic
            layouts turn “ami” into আমি as you type.
          </li>
        </ul>
      )}
    </div>
  );
}
