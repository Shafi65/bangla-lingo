"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { Translit } from "@/components/Translit";
import { hasRecording, speakQueue, useBengaliVoice } from "@/lib/speech";
import type { ReadingExercise, ReadingLine } from "@/lib/types";
import { Choices } from "./Choices";
import type { ExerciseProps } from "./types";

/**
 * A short dialogue (chat bubbles when lines have a `speaker`) or text, then one
 * question. English is hidden per line until tapped, so it is a real reading
 * task; transliteration follows the display setting.
 */
export function Reading({ ex, locked, onChange }: ExerciseProps<ReadingExercise>) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const voice = useBengaliVoice();
  const canPlay = voice !== "no" || ex.lines.some((l) => hasRecording(l.bn));
  const bnOptions = ex.options.every((o) => /[\u0980-\u09FF]/.test(o)); // Bengali answers to a Bengali question
  const dialogue = ex.lines.some((l) => l.speaker);
  const speakers = [...new Set(ex.lines.map((l) => l.speaker).filter(Boolean))];

  useEffect(() => () => stop.current?.(), []); // leaving the exercise ends playback

  const playAll = () => {
    if (running) {
      stop.current?.();
      return;
    }
    setRunning(true);
    stop.current = speakQueue(
      ex.lines.map((l) => l.bn),
      {
        onLine: setPlaying,
        onEnd: () => {
          stop.current = null;
          setRunning(false);
          setPlaying(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-2xl font-black">Read, then answer</h2>
      <section aria-label={ex.title ?? "Text"} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          {ex.title ? <h3 className="min-w-0 text-lg font-black text-pretty">{ex.title}</h3> : <span />}
          <button
            type="button"
            data-enter-native
            disabled={!canPlay}
            aria-pressed={running}
            onClick={playAll}
            className="btn btn-ghost btn-sm shrink-0"
          >
            <span aria-hidden>{running ? "■" : "▶"}</span> {running ? "Stop" : "Play all"}
          </button>
        </div>
        {dialogue ? (
          <ol className="flex flex-col gap-3">
            {ex.lines.map((l, i) => (
              <li key={i} className={`flex ${speakers.indexOf(l.speaker) % 2 === 1 ? "justify-end" : "justify-start"}`}>
                <Line line={l} bubble right={speakers.indexOf(l.speaker) % 2 === 1} active={playing === i} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="card flex flex-col gap-3 p-4">
            {ex.lines.map((l, i) => (
              <Line key={i} line={l} active={playing === i} />
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-1">
        {ex.questionBn ? (
          <>
            <div className="flex items-center gap-3">
              <SpeakButton bn={ex.questionBn.bn} size="sm" />
              <div className="min-w-0">
                <p lang="bn" className="text-2xl font-black text-pretty [overflow-wrap:anywhere]">{ex.questionBn.bn}</p>
                <div className="text-sm font-semibold">
                  <Translit tr={ex.questionBn.tr} />
                </div>
              </div>
            </div>
            <p className="text-base font-semibold text-pretty text-muted">{ex.question}</p>
          </>
        ) : (
          <p className="text-xl font-black text-pretty">{ex.question}</p>
        )}
      </div>
      <Choices
        options={ex.options}
        bengali={bnOptions}
        translit={bnOptions ? "after" : "never"}
        locked={locked}
        onChange={onChange}
        answer={ex.answer}
      />
    </div>
  );
}

function Line({
  line,
  bubble = false,
  right = false,
  active,
}: {
  line: ReadingLine;
  bubble?: boolean;
  right?: boolean;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const tone = bubble
    ? `max-w-[92%] rounded-2xl border-2 px-3.5 py-2.5 ${
        right ? "rounded-br-md border-brand/25 bg-brand-light" : "rounded-bl-md border-line bg-surface"
      }`
    : "";
  return (
    <div
      className={`min-w-0 transition-shadow ${tone} ${active ? "ring-4 ring-brand/35" : ""}`}
      data-playing={active ? "true" : undefined}
    >
      {line.speaker && <div className="mb-0.5 text-xs font-extrabold tracking-wide text-muted uppercase">{line.speaker}</div>}
      <div className="flex items-start gap-2.5">
        <SpeakButton bn={line.bn} size="sm" className="mt-1" />
        <div className="min-w-0">
          <p lang="bn" className="text-xl font-bold text-pretty text-ink [overflow-wrap:anywhere]">{line.bn}</p>
          <div className="text-sm font-semibold">
            <Translit tr={line.tr} />
          </div>
          <button
            type="button"
            data-enter-native
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="mt-1 -ml-1 min-h-8 rounded-md px-1 text-sm font-extrabold text-brand-dark underline decoration-2 underline-offset-2"
          >
            {open ? "Hide translation" : "Show translation"}
          </button>
          {open && (
            <p id={id} className="text-sm font-semibold text-pretty text-ink/80">
              {line.en}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
