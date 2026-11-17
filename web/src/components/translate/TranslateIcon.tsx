/** Two overlapping speech bubbles, a Latin "A" in one and a stroke in the other: translate. */
export function TranslateIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 4.5h9a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5H8l-3 2.5v-2.5H3.5A1.5 1.5 0 012 12V6a1.5 1.5 0 011.5-1.5z" />
      <path d="M5.8 11l2.2-5 2.2 5M6.6 9.3h2.8" strokeWidth={1.8} />
      <path d="M16.5 9.5h4A1.5 1.5 0 0122 11v6a1.5 1.5 0 01-1.5 1.5H19v2.5l-3-2.5h-3.5A1.5 1.5 0 0111 17v-1.5" />
      <path d="M15 13.2h4.5M17.6 13.2c0 1.8-.9 3-2.3 3.6" strokeWidth={1.8} />
    </svg>
  );
}
