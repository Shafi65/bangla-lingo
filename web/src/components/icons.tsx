export function FlameIcon({ hollow = false, size = 22 }: { hollow?: boolean; size?: number }) {
  const d =
    "M12 2s5 4.6 5 10a5 5 0 01-10 0c0-2.2 1.1-3.7 2-4.6 0 1.6.9 2.8 2 3.1C10.6 7.8 12 2 12 2z";
  if (hollow) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d={d} />
      <path fill="#fff" opacity=".55" d="M12 21a3 3 0 01-3-3c0-1.6 1.5-3 3-4.5 1.5 1.5 3 2.9 3 4.5a3 3 0 01-3 3z" />
    </svg>
  );
}

export function BoltIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

export function StarIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"
      />
    </svg>
  );
}

const nav = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Winding path with stops: the course map. */
export function PathIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M6 20c6 0 10-2 10-5s-8-3-8-6 3-5 9-5" strokeDasharray="1 3.5" />
      <circle cx="6" cy="20" r="2" fill="currentColor" />
      <circle cx="17" cy="4" r="2" fill="currentColor" />
    </svg>
  );
}
/** Two arrows chasing: practice / review. */
export function RepeatIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M4 11a7 7 0 0112-4.9L18 8" />
      <path d="M18 3v5h-5" />
      <path d="M20 13a7 7 0 01-12 4.9L6 16" />
      <path d="M6 21v-5h5" />
    </svg>
  );
}
/** Open notebook: my words. */
export function BookIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}
export function GearIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M10.3 3.2h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.8l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.8L4.2 8.6l1.7-2.9 2.3.8 1.6-.9z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}
export function CheckIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function LockIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="currentColor" />
      <path d="M8 10V7.5a4 4 0 018 0V10" stroke="currentColor" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
/** Signpost: the grammar and culture guide. */
export function GuideIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M12 3v18" />
      <path d="M5 6h11l3 2.5L16 11H5z" />
      <path d="M19 14H8l-3 2.5L8 19h11z" />
    </svg>
  );
}
/** Magnifier over a page: the dictionary. */
export function SearchBookIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M14 3.5H6.5a2 2 0 00-2 2v13a2 2 0 002 2H13" />
      <path d="M8 8h6M8 11.5h3" />
      <circle cx="16.5" cy="15" r="3.2" />
      <path d="M18.8 17.3l2.2 2.2" />
    </svg>
  );
}
/** Sun / moon for the appearance setting. */
export function SunIcon() {
  return (
    <svg {...nav} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}
export function MoonIcon() {
  return (
    <svg {...nav} aria-hidden>
      <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />
    </svg>
  );
}
export function DeviceIcon() {
  return (
    <svg {...nav} aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}
