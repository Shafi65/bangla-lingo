import { useSyncExternalStore } from "react";
import { progressStore, type TtsSpeed, TTS_RATES } from "./progress";

// Bengali audio. Two sources, in order:
//   1. Pre-generated clips (web/public/audio/*.mp3) listed in the manifest that
//      next.config.ts inlines at build time (content/audio/manifest.json).
//   2. The browser's Web Speech API, only with a real Bengali voice.
// Everything is guarded so it is safe to import on the server.

// ---------------------------------------------------------------------------
// Recorded clips

interface AudioManifest {
  voice: string | null;
  items: Record<string, string>;
}

function loadManifest(): AudioManifest {
  try {
    const m = JSON.parse(process.env.BL_AUDIO_MANIFEST || "{}") as Partial<AudioManifest>;
    return { voice: m.voice ?? null, items: m.items ?? {} };
  } catch {
    return { voice: null, items: {} };
  }
}

const MANIFEST = loadManifest();

/** Same normalisation as content/scripts/gen-audio.mjs. */
const audioKey = (s: string) => s.normalize("NFC").trim();

/** Number of recorded clips shipped with this build. */
export const recordedClipCount = Object.keys(MANIFEST.items).length;
export const recordedVoice = MANIFEST.voice;

export function hasRecording(bn: string): boolean {
  return audioKey(bn) in MANIFEST.items;
}

/** Playback rates for recorded clips (natural speed = 1). */
const CLIP_RATES: Record<TtsSpeed, number> = { slow: 0.8, normal: 1, fast: 1.15 };
const SLOW_FACTOR = 0.75;

let audioEl: HTMLAudioElement | null = null;

/** Plays a clip; calls `onFail` if the file can't be loaded or decoded. */
function playClip(file: string, rate: number, onFail: () => void) {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = "auto";
  }
  const a = audioEl;
  const s = synth();
  if (s && (s.speaking || s.pending)) s.cancel();
  a.pause();
  const src = `/audio/${file}`;
  if (!a.src.endsWith(src)) a.src = src;
  a.currentTime = 0;
  a.playbackRate = rate;
  a.onerror = () => {
    a.onerror = null;
    onFail();
  };
  a.play().catch((err: DOMException) => {
    // NotAllowedError = autoplay blocked (no user gesture yet); the play button still works.
    // AbortError = interrupted by a newer play() call.
    if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") onFail();
  });
}

// ---------------------------------------------------------------------------
// Web Speech fallback

function synth(): SpeechSynthesis | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return undefined;
  }
  return window.speechSynthesis;
}

const normLang = (l: string) => l.replace("_", "-").toLowerCase();

/** Best Bengali voice: bn-BD, then bn-IN, then any "bn*". Never a non-Bengali voice. */
export function getBengaliVoice(): SpeechSynthesisVoice | undefined {
  const voices = synth()?.getVoices() ?? [];
  return (
    voices.find((v) => normLang(v.lang) === "bn-bd") ??
    voices.find((v) => normLang(v.lang) === "bn-in") ??
    voices.find((v) => normLang(v.lang).startsWith("bn"))
  );
}

const VOICE_WAIT_MS = 1500;
let voicesSettled = false;
let voicesPromise: Promise<void> | null = null;
const voiceListeners = new Set<() => void>();

/** Resolves once the voice list has loaded, or after ~1.5 s. */
function voicesReady(): Promise<void> {
  const s = synth();
  if (!s) {
    voicesSettled = true;
    return Promise.resolve();
  }
  if (voicesPromise) return voicesPromise;
  voicesPromise = new Promise<void>((resolve) => {
    const finish = () => {
      if (voicesSettled) return;
      voicesSettled = true;
      s.removeEventListener("voiceschanged", onChange);
      window.clearInterval(poll);
      window.clearTimeout(timer);
      voiceListeners.forEach((l) => l());
      resolve();
    };
    // Some engines fire voiceschanged more than once; a Bengali voice ends the wait early.
    const onChange = () => {
      voiceListeners.forEach((l) => l());
      if (getBengaliVoice()) finish();
    };
    s.addEventListener("voiceschanged", onChange);
    const poll = window.setInterval(() => {
      if (getBengaliVoice()) finish();
    }, 100);
    const timer = window.setTimeout(finish, VOICE_WAIT_MS);
    if (getBengaliVoice()) finish();
  });
  return voicesPromise;
}

// Keep a reference so the utterance isn't garbage-collected mid-speech (Chrome).
let current: SpeechSynthesisUtterance | null = null;
let pendingTimer: number | undefined;

function speakWithVoice(bn: string, rate: number) {
  const s = synth();
  const voice = getBengaliVoice();
  if (!s || !voice) return;
  const u = new SpeechSynthesisUtterance(bn);
  u.voice = voice;
  u.lang = voice.lang.replace("_", "-");
  u.rate = rate;
  u.onerror = (e) => {
    if (e.error !== "interrupted" && e.error !== "canceled") {
      console.warn(`[speech] could not speak "${bn}": ${e.error}`);
    }
  };
  u.onend = () => {
    if (current === u) current = null;
  };
  current = u;
  if (s.paused) s.resume();
  s.speak(u);
}

function speakSynth(bn: string, rate: number) {
  const s = synth();
  if (!s) return;
  window.clearTimeout(pendingTimer);
  const go = () => {
    // Chrome can drop an utterance queued right after cancel(), so only cancel
    // when something is actually playing and give the engine a moment.
    if (s.speaking || s.pending) {
      s.cancel();
      pendingTimer = window.setTimeout(() => speakWithVoice(bn, rate), 80);
    } else {
      speakWithVoice(bn, rate);
    }
  };
  // Speak synchronously when we can, so it stays inside the user's tap (iOS).
  if (getBengaliVoice() || voicesSettled) go();
  else void voicesReady().then(go);
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Speak Bengali text at the learner's chosen speed (`slow` = slower still).
 * Uses a recorded clip when there is one, else a device Bengali voice.
 * Returns false when neither is (or may become) available.
 */
export function speak(bn: string, { slow = false }: { slow?: boolean } = {}): boolean {
  if (typeof window === "undefined") return false;
  const speed = progressStore.get().settings.ttsSpeed;
  const synthRate = TTS_RATES[speed] * (slow ? 0.7 : 1);
  const file = MANIFEST.items[audioKey(bn)];
  if (file) {
    playClip(file, CLIP_RATES[speed] * (slow ? SLOW_FACTOR : 1), () => speakSynth(bn, synthRate));
    return true;
  }
  if (!synth() || (voicesSettled && !getBengaliVoice())) return false;
  speakSynth(bn, synthRate);
  return true;
}

// ---------------------------------------------------------------------------
// React hooks

/** "pending" while the device voice list is still loading. */
export type AudioAvailability = "yes" | "no" | "pending";

function subscribe(cb: () => void) {
  const s = synth();
  if (!s) return () => {};
  voiceListeners.add(cb);
  s.addEventListener("voiceschanged", cb);
  void voicesReady();
  return () => {
    voiceListeners.delete(cb);
    s.removeEventListener("voiceschanged", cb);
  };
}

function voiceState(): AudioAvailability {
  if (getBengaliVoice()) return "yes";
  return voicesSettled || !synth() ? "no" : "pending";
}

/** Reactive: whether this device has a Bengali voice. */
export function useBengaliVoice(): AudioAvailability {
  return useSyncExternalStore(subscribe, voiceState, () => "pending");
}

/** Reactive: true once a Bengali voice is available on this device. */
export function useHasBengaliVoice(): boolean {
  return useBengaliVoice() === "yes";
}

/** Reactive, per text: can `speak(bn)` produce sound (recorded clip or device voice)? */
export function useCanSpeak(bn: string): AudioAvailability {
  const voice = useBengaliVoice();
  return hasRecording(bn) ? "yes" : voice;
}

/** Name and language of the device voice that would be used, or null. */
export function useDeviceVoice(): { name: string; lang: string } | null {
  const id = useSyncExternalStore(
    subscribe,
    () => {
      const v = getBengaliVoice();
      return v ? `${v.lang}\u0000${v.name}` : "";
    },
    () => "",
  );
  if (!id) return null;
  const [lang, name] = id.split("\u0000");
  return { name, lang };
}
