"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkResponse, type Response } from "@/lib/answers";
import { answerCurrent, currentItem, progressOf, stopSession } from "@/lib/placement/engine";
import type { ItemBank, PlacementConfig, SessionState, StageId } from "@/lib/placement/types";
import { ItemView } from "./ItemView";
import { HStitch } from "./Thread";

const STAGE_NAMES: Record<StageId, string> = {
  script: "Script check",
  routing: "Warm-up",
  block: "Your level",
  final: "Fine-tuning",
};

/**
 * Runs the adaptive test. Test-mode feedback only: no right/wrong, no hearts, no XP; after each
 * answer a quiet "Next" moves on. "I don't know" counts as wrong without guessing.
 */
export function TestRunner({
  bank,
  config,
  session,
  onSession,
}: {
  bank: ItemBank;
  config: PlacementConfig;
  session: SessionState;
  onSession: (s: SessionState) => void;
}) {
  const item = currentItem(session, bank);
  const [response, setResponse] = useState<Response | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const live = useRef<HTMLParagraphElement>(null);
  const { answered, expected } = progressOf(session, config);
  const stages: StageId[] = [...(session.answers.some((a) => a.stage === "script") || session.stage === "script" ? (["script"] as StageId[]) : []), "routing", "block", "final"];

  const next = useCallback(
    (skipped: boolean) => {
      if (!item) return;
      const correct = !skipped && response !== null && checkResponse(item.exercise, response);
      setResponse(null);
      setConfirmStop(false);
      onSession(answerCurrent(session, bank, config, correct, skipped));
    },
    [item, response, session, bank, config, onSession],
  );

  // Enter = Next (except where focus needs Enter itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || !response) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("a, textarea, input, dialog, [data-enter-native]")) return;
      if (t?.closest("button") && !t.closest(".choice")) return; // other buttons answer Enter themselves
      e.preventDefault();
      next(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [response, next]);

  // Move focus to the new question so screen readers start there.
  useEffect(() => {
    live.current?.focus();
  }, [item?.id]);

  if (!item) return null;
  const stageIdx = stages.indexOf(session.stage as StageId);
  const perStage = (st: StageId) => {
    const done = session.answers.filter((a) => a.stage === st).length;
    if (st === session.stage) return done / Math.max(1, done + session.queue.length - session.index);
    return stages.indexOf(st) < stageIdx ? 1 : 0;
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 pb-4">
        <div
          role="progressbar"
          aria-label="Test progress"
          aria-valuemin={0}
          aria-valuemax={expected}
          aria-valuenow={answered}
          aria-valuetext={`Question ${answered + 1} of about ${expected}`}
          className="flex-1"
        >
          <HStitch segments={stages.map((st) => ({ fill: perStage(st), current: st === session.stage }))} />
        </div>
        {confirmStop ? (
          <span className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSession(stopSession(session))}>
              Stop now
            </button>
            <button type="button" className="btn btn-sm px-3 text-muted" onClick={() => setConfirmStop(false)}>
              Keep going
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="h-10 rounded-xl px-2 text-sm font-extrabold text-muted hover:bg-sunk hover:text-ink"
            onClick={() => setConfirmStop(true)}
          >
            Stop test
          </button>
        )}
      </div>

      <p ref={live} tabIndex={-1} className="mb-3 flex justify-between gap-3 text-sm font-extrabold text-muted outline-none">
        <span>{STAGE_NAMES[session.stage as StageId]}</span>
        <span>
          {answered + 1} of about {expected}
        </span>
      </p>

      <div key={item.id} data-item-id={item.id} className="animate-enter flex-1 pb-6">
        <ItemView item={item} onChange={setResponse} />
      </div>

      <div className="sticky bottom-0 -mx-5 flex gap-3 border-t-2 border-line bg-paper/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button type="button" className="btn btn-ghost flex-1 px-3" onClick={() => next(true)}>
          I don&apos;t know
        </button>
        <button type="button" className="btn btn-primary flex-1" disabled={!response} onClick={() => next(false)}>
          Next
        </button>
      </div>
    </div>
  );
}
