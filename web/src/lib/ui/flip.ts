// FLIP animation helper: elements marked data-flip="<key>" inside a container
// glide from where they were on the previous render to where they are now
// (e.g. a word tile moving from the bank to the answer line). No-ops on the
// server, without the Web Animations API, and under prefers-reduced-motion.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useFlip(container: RefObject<HTMLElement | null>, dep: unknown, duration = 260): void {
  const prev = useRef<Map<string, DOMRect>>(new Map());

  useIsoLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));
    const next = new Map<string, DOMRect>();
    for (const el of els) next.set(el.dataset.flip!, el.getBoundingClientRect());

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && typeof Element.prototype.animate === "function") {
      for (const el of els) {
        const key = el.dataset.flip!;
        const from = prev.current.get(key);
        const to = next.get(key)!;
        if (!from) continue;
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
          { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    }
    prev.current = next;
  }, [dep, container, duration]);
}
