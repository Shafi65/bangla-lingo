"use client";

import { speak, useCanSpeak } from "@/lib/speech";

const NO_VOICE = "No Bengali voice on this device";

export function SpeakButton({
  bn,
  size = "md",
  slow = false,
  className = "",
}: {
  bn: string;
  size?: "sm" | "md" | "lg";
  slow?: boolean;
  className?: string;
}) {
  // Stays enabled while the device voice list is still loading, so a tap always tries.
  const hasVoice = useCanSpeak(bn) !== "no";
  const dims =
    size === "lg" ? "h-20 w-20" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const icon = size === "lg" ? 40 : size === "sm" ? 16 : 22;
  const label = hasVoice ? `${slow ? "Play slowly" : "Play audio"}: ${bn}` : NO_VOICE;

  return (
    <span className="group relative inline-flex" title={hasVoice ? undefined : NO_VOICE}>
      <button
        type="button"
        data-enter-native
        aria-label={label}
        disabled={!hasVoice}
        onClick={(e) => {
          e.stopPropagation();
          speak(bn, { slow });
        }}
        className={`${dims} inline-flex shrink-0 items-center justify-center rounded-2xl border-b-4 transition ${
          hasVoice
            ? "border-brand-dark bg-brand text-white hover:brightness-110 active:translate-y-0.5 active:border-b-2"
            : "cursor-not-allowed border-line bg-line text-muted"
        } ${className}`}
      >
        <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          {slow ? (
            <path d="M16 10.5a2.5 2.5 0 010 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path
              d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      {!hasVoice && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-white group-hover:block group-focus-within:block"
        >
          {NO_VOICE}
        </span>
      )}
    </span>
  );
}
