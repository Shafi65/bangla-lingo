// Confetti bursts (canvas-confetti, loaded on first use). Skipped entirely when the device asks for
// reduced motion; never throws.
type Confetti = typeof import("canvas-confetti");

// Flag green, flag red, marigold, leaf green, white.
const COLORS = ["#006a4e", "#f42a41", "#ffb300", "#2f9e78", "#ffffff"];

let lib: Promise<Confetti> | null = null;
const load = () => (lib ??= import("canvas-confetti").then((m) => (m.default ?? m) as unknown as Confetti));

function reduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export type Burst = "small" | "big" | "streak";

/** Fire a burst. `origin` is in viewport fractions (0..1); defaults to just above the middle. */
export function celebrate(kind: Burst = "small", origin: { x: number; y: number } = { x: 0.5, y: 0.35 }): void {
  if (typeof window === "undefined" || reduced()) return;
  void load()
    .then((confetti) => {
      const base = { colors: COLORS, origin, disableForReducedMotion: true, zIndex: 60, scalar: 0.9 };
      if (kind === "small") {
        confetti({ ...base, particleCount: 45, spread: 70, startVelocity: 32 });
        return;
      }
      confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 42 });
      window.setTimeout(() => {
        confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
        confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
      }, 220);
      if (kind === "streak") {
        window.setTimeout(() => confetti({ ...base, particleCount: 70, spread: 140, startVelocity: 28, shapes: ["circle"], scalar: 1.1 }), 520);
      }
    })
    .catch(() => {});
}

/** Viewport-fraction origin at the centre of an element. */
export function originOf(el: Element | null): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}
