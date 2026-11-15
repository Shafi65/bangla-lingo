import type { Motif, Tone } from "@/lib/profile";

// Original badge art: an alpona-style scalloped rosette, a running kantha
// stitch inside its rim, and a folk motif in the middle (lotus, sun, star,
// paisley, fish, spiral, boat, or the first letter অ). Drawn in the app's own
// flag green / flag red / marigold; locked badges fall back to quiet greys.

const C = 48;

function rosette(n: number, r: number): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  });
  const chord = 2 * r * Math.sin(Math.PI / n);
  const lobe = (chord / 2) * 1.08;
  const f = (x: number) => x.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= n; i++) {
    const [x, y] = pts[i % n];
    d += `A${f(lobe)} ${f(lobe)} 0 0 1 ${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
}

const ROSETTE = rosette(14, 40);

function spiral(): string {
  let d = "";
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 5;
    const r = 1.2 + t * 0.95;
    const x = 20 + r * Math.cos(t);
    const y = 20 + r * Math.sin(t);
    d += `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}
const SPIRAL = spiral();

/** Motifs live in a 40x40 box. `ink` draws, `tint` fills quietly. */
function MotifArt({ motif }: { motif: Motif }) {
  const line = { fill: "none", stroke: "var(--ink)", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (motif) {
    case "lotus":
      return (
        <g>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <ellipse key={a} cx="20" cy="9.5" rx="4.2" ry="8.5" transform={`rotate(${a} 20 20)`} fill="var(--ink)" opacity={a % 90 ? 0.55 : 1} />
          ))}
          <circle cx="20" cy="20" r="4.6" fill="var(--tint)" stroke="var(--ink)" strokeWidth="2.4" />
        </g>
      );
    case "sun":
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M20 1.5 L23 8.5 L17 8.5 Z" fill="var(--ink)" transform={`rotate(${i * 30} 20 20)`} />
          ))}
          <circle cx="20" cy="20" r="8.5" fill="var(--ink)" />
          <circle cx="20" cy="20" r="4" fill="var(--tint)" />
        </g>
      );
    case "star":
      return (
        <g>
          <rect x="8" y="8" width="24" height="24" rx="2" fill="var(--ink)" />
          <rect x="8" y="8" width="24" height="24" rx="2" fill="var(--ink)" transform="rotate(45 20 20)" />
          <rect x="14" y="14" width="12" height="12" rx="1.5" fill="var(--tint)" transform="rotate(45 20 20)" />
          <circle cx="20" cy="20" r="2.4" fill="var(--ink)" />
        </g>
      );
    case "paisley":
      return (
        <g>
          <path d="M23 4 C33 9 36 23 27 32 C20 38 9 36 7 27 C5 19 13 14 19 18 C23 21 21 27 17 26" {...line} />
          <circle cx="23.5" cy="25" r="2.2" fill="var(--ink)" />
          <path d="M28 12 C31 16 31 21 29 25" {...line} strokeWidth={1.8} strokeDasharray="1 3.4" />
        </g>
      );
    case "fish":
      return (
        <g>
          <path d="M4 20 C10 9 25 9 30 20 C25 31 10 31 4 20 Z" fill="var(--ink)" />
          <path d="M29 20 L38 12 L36 20 L38 28 Z" fill="var(--ink)" />
          <circle cx="11" cy="18.5" r="2.2" fill="var(--tint)" />
          <path d="M16 14 C19 18 19 22 16 26 M21 14 C24 18 24 22 21 26" fill="none" stroke="var(--tint)" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      );
    case "spiral":
      return <path d={SPIRAL} {...line} />;
    case "boat":
      return (
        <g>
          <path d="M2 23 C9 34 31 34 38 23 C29 27 11 27 2 23 Z" fill="var(--ink)" />
          <path d="M20 25 L20 4" {...line} strokeWidth={2.2} />
          <path d="M21.5 6 C29 10 32 16 31 21 L21.5 21 Z" fill="var(--ink)" opacity="0.6" />
          <path d="M6 37 C10 35 14 39 18 37 C22 35 26 39 30 37 C32 36 34 36 35 37" {...line} strokeWidth={1.8} />
        </g>
      );
    case "letter":
      return (
        <text x="20" y="31" textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--ink)" style={{ fontFamily: "var(--font-bengali)" }} lang="bn">
          অ
        </text>
      );
  }
}

const TONES: Record<Tone, string> = {
  brand: "[--ink:var(--color-brand)] [--tint:var(--color-brand-light)] [--rim:var(--color-brand)] [--tab-text:#fff]",
  accent: "[--ink:var(--color-accent)] [--tint:var(--color-accent-light)] [--rim:var(--color-accent)] [--tab-text:#fff]",
  sun: "[--ink:var(--color-sun-edge)] [--tint:var(--color-sun-light)] [--rim:var(--color-sun)] [--tab-text:#1f2a2e]",
};
const LOCKED = "[--ink:var(--color-line-strong)] [--tint:var(--color-sunk)] [--rim:var(--color-line-strong)] [--tab-text:var(--color-muted)]";

export function Badge({
  motif,
  tone,
  tier,
  earned,
  size = 88,
}: {
  motif: Motif;
  tone: Tone;
  tier?: string;
  earned: boolean;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden className={earned ? TONES[tone] : LOCKED}>
      <path d={ROSETTE} fill="var(--rim)" />
      <circle cx={C} cy={C} r="33" fill="var(--tint)" />
      <circle cx={C} cy={C} r="28.5" fill="none" stroke="var(--rim)" strokeWidth="2.2" strokeDasharray="2.2 4.4" strokeLinecap="round" />
      <g transform="translate(29 28) scale(0.95)">
        <MotifArt motif={motif} />
      </g>
      {tier && (
        <g>
          <rect x={C - 6 - tier.length * 4.4} y="74" width={12 + tier.length * 8.8} height="17" rx="8.5" fill="var(--rim)" stroke="var(--color-surface)" strokeWidth="2.5" />
          <text x={C} y="87" textAnchor="middle" fontSize="12.5" fontWeight="900" fill="var(--tab-text)">
            {tier}
          </text>
        </g>
      )}
    </svg>
  );
}
