// Recording capability helpers (browser only; every function tolerates a missing API).

/** Preferred containers, best first. Chrome/Firefox take webm/ogg; Safari takes mp4. */
export const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
] as const;

/** First candidate the recorder class says it can write; "" lets the browser choose its default. */
export function pickMimeType(
  MR: { isTypeSupported?: (t: string) => boolean } | undefined | null,
  candidates: readonly string[] = MIME_CANDIDATES,
): string {
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const t of candidates) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
      // some engines throw on odd strings; try the next one
    }
  }
  return "";
}

export type RecordSupport = "yes" | "no-recorder" | "no-mic-api";

/** Can this page record? Server-safe (returns "no-recorder"). */
export function recordSupport(): RecordSupport {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return "no-recorder";
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "no-mic-api";
  return "yes";
}

export type MicProblem = "denied" | "no-device" | "busy" | "other";

/** Maps a getUserMedia / MediaRecorder error to something the learner can act on. */
export function classifyMicError(err: unknown): MicProblem {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-device";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "other";
}
