// Silence trimming and waveform peaks over mono PCM. Pure; works on Float32Array.

export interface TrimResult {
  /** First and last (exclusive) sample to keep. */
  start: number;
  end: number;
  /** True when nothing rose above the noise floor (the whole clip is returned). */
  silent: boolean;
}

export interface TrimOptions {
  /** Analysis window, seconds. */
  frameSec?: number;
  /** Padding kept on both sides of the voiced part, seconds. */
  padSec?: number;
  /** Frames quieter than this fraction of the loudest frame count as silence. */
  relThreshold?: number;
  /** Absolute RMS floor: a clip whose loudest frame is below this is "silent". */
  floor?: number;
}

/** Average all channels to mono. */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Finds the span from the first to the last non-silent frame, plus padding. */
export function trimSilence(samples: Float32Array, sampleRate: number, opts: TrimOptions = {}): TrimResult {
  const { frameSec = 0.01, padSec = 0.05, relThreshold = 0.1, floor = 0.004 } = opts;
  const n = samples.length;
  const whole = { start: 0, end: n, silent: true };
  if (n === 0 || !(sampleRate > 0)) return whole;
  const frame = Math.max(1, Math.round(frameSec * sampleRate));
  const frames = Math.ceil(n / frame);
  const rms = new Float32Array(frames);
  let max = 0;
  for (let f = 0; f < frames; f++) {
    const from = f * frame;
    const to = Math.min(n, from + frame);
    let sum = 0;
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    const v = Math.sqrt(sum / (to - from));
    rms[f] = v;
    if (v > max) max = v;
  }
  if (max < floor) return whole;
  const thr = Math.max(floor, max * relThreshold);
  let first = 0;
  while (first < frames && rms[first] < thr) first++;
  let last = frames - 1;
  while (last > first && rms[last] < thr) last--;
  const pad = Math.round(padSec * sampleRate);
  return {
    start: Math.max(0, first * frame - pad),
    end: Math.min(n, (last + 1) * frame + pad),
    silent: false,
  };
}

/**
 * `bars` peak values in 0..1 for samples[start, end), scaled so the tallest bar is 1.
 * A silent span gives all zeros.
 */
export function peaks(samples: Float32Array, start: number, end: number, bars: number): number[] {
  const count = Math.max(0, Math.floor(bars));
  const out = new Array<number>(count).fill(0);
  const len = end - start;
  if (count === 0 || len <= 0) return out;
  let max = 0;
  for (let b = 0; b < count; b++) {
    const from = start + Math.floor((b * len) / count);
    const to = Math.max(from + 1, start + Math.floor(((b + 1) * len) / count));
    let p = 0;
    for (let i = from; i < to && i < samples.length; i++) {
      const v = Math.abs(samples[i]);
      if (v > p) p = v;
    }
    out[b] = p;
    if (p > max) max = p;
  }
  if (max <= 0) return out;
  return out.map((p) => p / max);
}
