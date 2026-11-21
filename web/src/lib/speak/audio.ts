// Browser-only audio helpers: decode a clip or a recording and reduce it to trimmed waveform peaks.
import { peaks, toMono, trimSilence } from "./trim";

export interface Wave {
  /** 0..1 bar heights, silence trimmed. */
  bars: number[];
  /** Length of the trimmed part, seconds. */
  seconds: number;
  /** No sound found (e.g. a muted mic). */
  silent: boolean;
}

export const BARS = 72;

type AudioCtxCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function context(): AudioContext {
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor: AudioCtxCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not available");
  ctx = new Ctor();
  return ctx;
}

/** Decodes encoded audio (mp3, webm, mp4 ...) and returns its trimmed waveform. */
export async function waveFromBuffer(buf: ArrayBuffer): Promise<Wave> {
  const audio = await context().decodeAudioData(buf.slice(0));
  const channels: Float32Array[] = [];
  for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
  const mono = toMono(channels);
  const { start, end, silent } = trimSilence(mono, audio.sampleRate);
  return { bars: peaks(mono, start, end, BARS), seconds: (end - start) / audio.sampleRate, silent };
}

const nativeCache = new Map<string, Promise<Wave>>();

/** Waveform of a shipped clip (/audio/<file>). Cached; a failed load is not remembered. */
export function nativeWave(clip: string): Promise<Wave> {
  let p = nativeCache.get(clip);
  if (!p) {
    p = fetch(`/audio/${clip}`)
      .then((r) => {
        if (!r.ok) throw new Error(`clip ${r.status}`);
        return r.arrayBuffer();
      })
      .then(waveFromBuffer);
    nativeCache.set(clip, p);
    p.catch(() => nativeCache.delete(clip));
  }
  return p;
}
