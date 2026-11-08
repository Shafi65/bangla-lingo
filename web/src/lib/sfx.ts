// Tiny synthesized sound effects (Web Audio, no asset files). Respect the
// learner's "sound effects" setting; every call is a silent no-op when off,
// on the server, or when audio is unavailable.
import { progressStore } from "./progress";

type Sfx = "correct" | "wrong" | "complete";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.12,
) {
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

export function playSfx(kind: Sfx) {
  if (!progressStore.get().settings.sound) return;
  const ac = audio();
  if (!ac) return;
  try {
    if (kind === "correct") {
      tone(ac, 660, 0, 0.12, "triangle");
      tone(ac, 990, 0.08, 0.2, "triangle");
    } else if (kind === "wrong") {
      tone(ac, 220, 0, 0.22, "sine", 0.1);
      tone(ac, 196, 0.1, 0.25, "sine", 0.08);
    } else {
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.09, 0.3, "triangle", 0.1));
    }
  } catch {
    // ignore: sound is never essential
  }
}
