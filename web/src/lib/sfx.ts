// Sound effects. Original sounds made by scripts/gen-sfx.mjs (public/sfx/*.mp3) and played with
// howler.js, which is loaded on first use. If a file cannot play, a tiny Web Audio tone stands in.
// Every call respects the learner's "sound effects" setting and is a silent no-op when it is off,
// on the server, or when audio is unavailable.
import type { Howl } from "howler";
import { progressStore } from "./progress";
import { SFX_FILES, sfxUrl, type Sfx } from "./sfxFiles";

export type { Sfx };

const VOLUME: Partial<Record<Sfx, number>> = { tap: 0.4, wrong: 0.55, coin: 0.6 };

const howls = new Map<Sfx, Howl>();
let loading: Promise<typeof import("howler")> | null = null;
let failed = false;

function howler() {
  loading ??= import("howler");
  return loading;
}

/** Start loading the player and the sounds (call from a page that will play them soon). */
export function preloadSfx(): void {
  if (typeof window === "undefined" || failed) return;
  void howler()
    .then(({ Howl }) => {
      for (const s of SFX_FILES) if (!howls.has(s)) howls.set(s, new Howl({ src: [sfxUrl(s)], volume: VOLUME[s] ?? 0.8, preload: true }));
    })
    .catch(() => {
      failed = true;
    });
}

export function playSfx(kind: Sfx): void {
  if (typeof window === "undefined" || !progressStore.get().settings.sound) return;
  const ready = howls.get(kind);
  if (ready && ready.state() === "loaded") {
    try {
      ready.play();
      return;
    } catch {
      // fall through to the tone
    }
  }
  if (ready?.state() === "loading") {
    ready.once("load", () => ready.play());
    return;
  }
  if (!failed && !ready) preloadSfx();
  synth(kind);
}

// ------------------------------------------------------------------ fallback tones

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "sine", peak = 0.12) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

function synth(kind: Sfx) {
  const ac = audio();
  if (!ac) return;
  try {
    if (kind === "wrong") {
      tone(ac, 220, 0, 0.22, "sine", 0.1);
      tone(ac, 196, 0.1, 0.25, "sine", 0.08);
    } else if (kind === "complete" || kind === "streak" || kind === "chest") {
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.09, 0.3, "triangle", 0.1));
    } else if (kind === "tap") {
      tone(ac, 330, 0, 0.08, "sine", 0.06);
    } else {
      tone(ac, 660, 0, 0.12, "triangle");
      tone(ac, 990, 0.08, 0.2, "triangle");
    }
  } catch {
    // ignore: sound is never essential
  }
}
