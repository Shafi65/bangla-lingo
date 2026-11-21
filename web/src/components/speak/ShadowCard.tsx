"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nativeWave, waveFromBuffer, type Wave } from "@/lib/speak/audio";
import { itemKey, type SpeakItem } from "@/lib/speak/items";
import { RATING_LABELS, useSpeakHistory, type Rating } from "@/lib/speak/history";
import { classifyMicError, pickMimeType, recordSupport, type MicProblem } from "@/lib/speak/mime";
import { Waveform } from "./Waveform";

const SLOW_RATE = 0.7;
/** A take is stopped by itself after this long (shadowing is for short lines). */
const MAX_TAKE_MS = 12_000;

type Phase = "idle" | "recording" | "ready";
type Playing = "native" | "you" | null;
interface Take {
  url: string;
  wave: Wave | null;
  waveStatus: "loading" | "ready" | "error";
}

const PROBLEM_TEXT: Record<MicProblem | "empty", string> = {
  denied:
    "The microphone is blocked. Allow it for this site in your browser's address-bar or site settings, then press Record again. You can still listen and rate yourself.",
  "no-device": "No microphone was found. Plug one in or check your device settings, then try again.",
  busy: "The microphone is being used by another app. Close it and try again.",
  other: "Recording did not start. Try again, or listen and say it out loud.",
  empty: "Nothing was recorded. Check your microphone and try again.",
};

const RATING_STYLE: Record<Rating, string> = {
  0: "btn-danger",
  1: "btn-ghost",
  2: "btn-primary",
};

function Icon({ d, fill = true }: { d: string; fill?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill={fill ? "currentColor" : "none"}>
      <path d={d} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" />
    </svg>
  );
}
const PLAY = "M7 4.5v15l12-7.5z";
const STOP = "M6 6h12v12H6z";
const MIC = "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zm-6 9a6 6 0 0012 0m-6 6v3";

export function ShadowCard({
  item,
  position,
  total,
  online,
  say,
  onRate,
  onSkip,
  autoFocus,
}: {
  item: SpeakItem;
  position: number;
  total: number;
  online: boolean;
  say: (msg: string) => void;
  onRate: (r: Rating) => void;
  onSkip: () => void;
  autoFocus: boolean;
}) {
  const history = useSpeakHistory()[itemKey(item)];
  const support = recordSupport();
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<MicProblem | "empty" | null>(null);
  const [take, setTake] = useState<Take | null>(null);
  const [slow, setSlow] = useState(false);
  const [playing, setPlaying] = useState<Playing>(null);
  const [native, setNative] = useState<{ wave: Wave | null; status: "loading" | "ready" | "error" }>({
    wave: null,
    status: "loading",
  });
  const [clipError, setClipError] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  const nativeAudio = useRef<HTMLAudioElement | null>(null);
  const youAudio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const urlRef = useRef<string | null>(null);

  const releaseMic = useCallback(() => {
    window.clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // Per-item setup/teardown. The card is keyed by item, so this runs once per card.
  useEffect(() => {
    alive.current = true;
    if (autoFocus) headingRef.current?.focus();
    nativeWave(item.clip).then(
      (wave) => alive.current && setNative({ wave, status: "ready" }),
      () => alive.current && setNative({ wave: null, status: "error" }),
    );
    return () => {
      // Recordings live in memory only: drop everything when the card goes away.
      alive.current = false;
      nativeAudio.current?.pause();
      youAudio.current?.pause();
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          // already stopped
        }
      }
      releaseMic();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mounted card
  }, []);

  const stopPlayback = useCallback(() => {
    for (const a of [nativeAudio.current, youAudio.current]) {
      if (a) {
        a.onended = null;
        a.pause();
      }
    }
    setPlaying(null);
  }, []);

  const play = useCallback(
    (which: "native" | "you", then?: () => void) => {
      stopPlayback();
      let a: HTMLAudioElement;
      if (which === "native") {
        a = nativeAudio.current ??= new Audio(`/audio/${item.clip}`);
        a.playbackRate = slow ? SLOW_RATE : 1;
      } else {
        if (!urlRef.current) return;
        a = youAudio.current = new Audio(urlRef.current);
      }
      a.currentTime = 0;
      a.onended = () => {
        a.onended = null;
        if (!alive.current) return;
        setPlaying(null);
        then?.();
      };
      setPlaying(which);
      setClipError(false);
      a.play().catch((err: DOMException) => {
        if (err?.name === "AbortError" || !alive.current) return;
        setPlaying(null);
        if (which === "native") {
          setClipError(true);
          say(online ? "The native clip could not be played." : "The native clip is not saved on this device yet, and you are offline.");
        } else say("Your recording could not be played.");
      });
    },
    [item.clip, online, say, slow, stopPlayback],
  );

  async function startRecording() {
    setProblem(null);
    stopPlayback();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setTake(null);
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const p = classifyMicError(err);
      if (alive.current) {
        setProblem(p);
        setPhase("idle");
        say(PROBLEM_TEXT[p]);
      }
      return;
    }
    if (!alive.current) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    let rec: MediaRecorder;
    try {
      const mimeType = pickMimeType(window.MediaRecorder);
      rec = mimeType ? new MediaRecorder(s, { mimeType }) : new MediaRecorder(s);
    } catch {
      releaseMic();
      setProblem("other");
      say(PROBLEM_TEXT.other);
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onerror = () => {
      releaseMic();
      if (!alive.current) return;
      setPhase("idle");
      setProblem("other");
      say(PROBLEM_TEXT.other);
    };
    rec.onstop = () => {
      releaseMic();
      if (!alive.current) return;
      const blob = new Blob(chunks, { type: rec.mimeType || chunks[0]?.type || "audio/webm" });
      if (blob.size === 0) {
        setPhase("idle");
        setProblem("empty");
        say(PROBLEM_TEXT.empty);
        return;
      }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setTake({ url, wave: null, waveStatus: "loading" });
      setPhase("ready");
      say("Recorded. Play it back, compare the waveforms, then rate yourself.");
      blob
        .arrayBuffer()
        .then(waveFromBuffer)
        .then(
          (wave) => alive.current && urlRef.current === url && setTake({ url, wave, waveStatus: "ready" }),
          () => alive.current && urlRef.current === url && setTake({ url, wave: null, waveStatus: "error" }),
        );
    };
    recorder.current = rec;
    rec.start();
    setPhase("recording");
    say("Recording. Say it now, then press Stop.");
    timer.current = window.setTimeout(() => stopRecording(), MAX_TAKE_MS);
  }

  function stopRecording() {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  const canRate = phase === "ready" || support !== "yes";
  const maxSeconds = Math.max(native.wave?.seconds ?? 0, take?.wave?.seconds ?? 0, 0.1);

  return (
    <section aria-labelledby="speak-line" className="card p-5" data-testid="shadow-card">
      <p className="text-sm font-extrabold text-muted">
        Phrase {position} of {total}
      </p>
      <h2 id="speak-line" ref={headingRef} tabIndex={-1} className="mt-1 outline-none">
        <span lang="bn" className="bn-display block text-3xl font-bold text-ink">
          {item.bn}
        </span>
        <span className="mt-1 block text-lg font-extrabold text-brand-dark italic">{item.tr}</span>
        <span className="block text-lg font-semibold text-muted">{item.en}</span>
      </h2>
      {history && (
        <p className="mt-2 text-sm font-bold text-muted" data-testid="last-rating">
          Last time: {RATING_LABELS[history.last]} (rated {history.n} {history.n === 1 ? "time" : "times"})
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => (playing === "native" ? stopPlayback() : play("native"))}
          aria-label={playing === "native" ? "Stop native clip" : "Play native clip"}
          data-testid="play-native"
        >
          <Icon d={playing === "native" ? STOP : PLAY} /> {playing === "native" ? "Stop" : "Listen"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-pressed={slow}
          onClick={() => setSlow((v) => !v)}
          data-testid="slow-toggle"
        >
          Slow ({SLOW_RATE}×)
        </button>
      </div>
      {clipError && (
        <p className="mt-3 text-sm font-bold text-accent-dark" role="note">
          {online
            ? "The clip could not be played. Try again in a moment."
            : "You are offline and this clip is not saved on this device. Download audio in Settings to keep it."}
        </p>
      )}

      <div className="mt-5 border-t-2 border-line pt-5">
        {support !== "yes" ? (
          <p className="rounded-2xl bg-sun-light p-3 text-sm font-bold text-sun-dark" role="note" data-testid="no-recorder">
            {support === "no-recorder"
              ? "This browser cannot record audio, so say the phrase out loud after the clip and rate yourself."
              : "Recording needs a secure (https) connection and a microphone. Say the phrase out loud after the clip and rate yourself."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {phase === "recording" ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={stopRecording} data-testid="stop-record">
                <Icon d={STOP} /> Stop
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={startRecording} data-testid="record">
                <Icon d={MIC} fill={false} /> {phase === "ready" ? "Record again" : problem ? "Try again" : "Record yourself"}
              </button>
            )}
            {phase === "ready" && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => (playing === "you" ? stopPlayback() : play("you"))}
                  data-testid="play-you"
                >
                  <Icon d={playing === "you" ? STOP : PLAY} /> {playing === "you" ? "Stop" : "Play yours"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => play("native", () => play("you"))}
                  data-testid="play-both"
                >
                  Play both
                </button>
              </>
            )}
          </div>
        )}
        {phase === "recording" && (
          <p className="mt-3 flex items-center gap-2 text-sm font-extrabold text-accent-dark">
            <span aria-hidden className="h-3 w-3 rounded-full bg-accent motion-safe:animate-pulse" /> Recording… press Stop when done
          </p>
        )}
        {problem && (
          <p className="mt-3 rounded-2xl bg-accent-light p-3 text-sm font-bold text-accent-dark" role="alert" data-testid="mic-problem">
            {PROBLEM_TEXT[problem]}
          </p>
        )}
      </div>

      {(phase === "ready" || native.status === "ready") && (
        <div className="mt-5 flex flex-col gap-3" data-testid="waves">
          <Waveform
            label="Native"
            tone="native"
            wave={native.wave}
            status={native.status}
            scale={(native.wave?.seconds ?? 0) / maxSeconds}
            testId="wave-native"
          />
          {phase === "ready" && take && (
            <Waveform
              label="You"
              tone="you"
              wave={take.wave}
              status={take.waveStatus}
              scale={(take.wave?.seconds ?? 0) / maxSeconds}
              testId="wave-you"
            />
          )}
        </div>
      )}

      {canRate && (
        <fieldset className="mt-6">
          <legend className="mb-2 text-base font-black">How did that sound?</legend>
          <div className="grid grid-cols-3 gap-2">
            {([0, 1, 2] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`btn btn-sm px-2 ${RATING_STYLE[r]}`}
                onClick={() => onRate(r)}
                data-testid={`rate-${r}`}
              >
                {RATING_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 text-center">
        <button type="button" className="min-h-11 rounded-xl px-4 text-base font-extrabold text-muted underline" onClick={onSkip} data-testid="skip">
          Skip this phrase
        </button>
      </div>
    </section>
  );
}
