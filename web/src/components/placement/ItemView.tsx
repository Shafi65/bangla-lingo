"use client";

import { ScriptOnlyContext } from "@/components/CourseContext";
import { LessonEnvContext } from "@/components/lesson/LessonEnv";
import { Choices } from "@/components/lesson/exercises/Choices";
import { FillBlank } from "@/components/lesson/exercises/FillBlank";
import { ListenMeaning } from "@/components/lesson/exercises/ListenMeaning";
import { ListenSelect } from "@/components/lesson/exercises/ListenSelect";
import { ScriptRecognize } from "@/components/lesson/exercises/ScriptRecognize";
import { SelectTranslation } from "@/components/lesson/exercises/SelectTranslation";
import type { Response } from "@/lib/answers";
import type { PlacementItem } from "@/lib/placement/types";
import type { ReadingExercise, SelectTranslationExercise } from "@/lib/types";

const ENV = { translit: {}, scriptTrack: true };

/**
 * One placement item in test mode. Reuses the lesson exercise components, but never "checks"
 * them (they stay unlocked, so no right/wrong colours and no transcript reveal), and hides
 * every romanization. Reading items are shown without audio or translations so they measure
 * reading only.
 */
export function ItemView({ item, onChange }: { item: PlacementItem; onChange: (r: Response | null) => void }) {
  const ex = item.exercise;
  const common = { locked: false, onChange, onSubmit: () => {} };
  let body;
  switch (ex.type) {
    case "listen_meaning":
      body = <ListenMeaning ex={ex} {...common} />;
      break;
    case "listen_select":
      body = <ListenSelect ex={ex} {...common} />;
      break;
    case "script_recognize":
      body = <ScriptRecognize ex={ex} {...common} />;
      break;
    case "fill_blank":
      body = <FillBlank ex={ex} {...common} />;
      break;
    case "select_translation":
      body = ex.direction === "en_to_bn" ? <SelectTranslation ex={ex} {...common} /> : <ReadMeaning ex={ex} onChange={onChange} />;
      break;
    case "reading":
      body = <ReadText ex={ex} onChange={onChange} />;
      break;
  }
  return (
    <LessonEnvContext.Provider value={ENV}>
      <ScriptOnlyContext.Provider value>
        {/* "Show pronunciation" would turn a reading item into a romanization item. */}
        <div className="[&_.translit-reveal]:hidden">{body}</div>
      </ScriptOnlyContext.Provider>
    </LessonEnvContext.Provider>
  );
}

/** Bengali word or sentence -> English meaning, script only. */
function ReadMeaning({ ex, onChange }: { ex: SelectTranslationExercise; onChange: (r: Response | null) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-black">What does this mean?</h2>
      <p lang="bn" className="text-3xl font-bold text-pretty text-ink [overflow-wrap:anywhere]">
        {ex.prompt.bn}
      </p>
      <Choices options={ex.options} bengali={false} locked={false} onChange={onChange} />
    </div>
  );
}

/** A short chat or text, script only, then one question. */
function ReadText({ ex, onChange }: { ex: ReadingExercise; onChange: (r: Response | null) => void }) {
  const speakers = [...new Set(ex.lines.map((l) => l.speaker).filter(Boolean))];
  const dialogue = speakers.length > 0;
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-black">Read, then answer</h2>
      <section aria-label={ex.title ?? "Text"} className="flex flex-col gap-3">
        {ex.title && <h3 className="text-lg font-black text-pretty">{ex.title}</h3>}
        {dialogue ? (
          <ol className="flex flex-col gap-3">
            {ex.lines.map((l, i) => {
              const right = speakers.indexOf(l.speaker) % 2 === 1;
              return (
                <li key={i} className={`flex ${right ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[92%] rounded-2xl border-2 px-3.5 py-2.5 ${
                      right ? "rounded-br-md border-brand/25 bg-brand-light" : "rounded-bl-md border-line bg-surface"
                    }`}
                  >
                    <div className="mb-0.5 text-sm font-extrabold text-muted">{l.speaker}</div>
                    <p lang="bn" className="text-xl font-bold text-pretty text-ink [overflow-wrap:anywhere]">
                      {l.bn}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="card flex flex-col gap-2 p-4">
            {ex.lines.map((l, i) => (
              <p key={i} lang="bn" className="text-xl font-bold text-pretty text-ink [overflow-wrap:anywhere]">
                {l.bn}
              </p>
            ))}
          </div>
        )}
      </section>
      <p className="text-xl font-black text-pretty">{ex.question}</p>
      <Choices options={ex.options} bengali={false} locked={false} onChange={onChange} />
    </div>
  );
}
