import { useSyncExternalStore } from "react";
import { progressStore, TTS_RATES } from "./progress";

// Web Speech API helpers. Everything is guarded so it is safe to import on the
// server (no window access at module scope).

function synth(): SpeechSynthesis | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return undefined;
  }
  return window.speechSynthesis;
}

/** Best Bengali voice: bn-BD, then bn-IN, then any "bn*". */
export function getBengaliVoice(): SpeechSynthesisVoice | undefined {
  const voices = synth()?.getVoices() ?? [];
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v.lang) === "bn-bd") ??
    voices.find((v) => norm(v.lang) === "bn-in") ??
    voices.find((v) => norm(v.lang).startsWith("bn"))
  );
}

/**
 * Speak Bengali text at the learner's chosen speed (`slow` = slower still).
 * Returns false if no Bengali voice is available.
 */
export function speak(bn: string, { slow = false }: { slow?: boolean } = {}): boolean {
  const s = synth();
  const base = TTS_RATES[progressStore.get().settings.ttsSpeed];
  const rate = slow ? base * 0.7 : base;
  const voice = getBengaliVoice();
  if (!s || !voice) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(bn);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = rate;
  s.speak(u);
  return true;
}

function subscribe(cb: () => void) {
  const s = synth();
  if (!s) return () => {};
  s.addEventListener("voiceschanged", cb);
  // Some browsers populate voices lazily without firing the event reliably.
  const t = window.setTimeout(cb, 500);
  return () => {
    s.removeEventListener("voiceschanged", cb);
    window.clearTimeout(t);
  };
}

/** Reactive: true once a Bengali voice is available on this device. */
export function useHasBengaliVoice(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!getBengaliVoice(),
    () => false,
  );
}
