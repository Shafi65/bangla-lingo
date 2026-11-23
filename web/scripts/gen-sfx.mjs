#!/usr/bin/env node
// Generates the app's sound effects into public/sfx/ as small mono MP3 files (via ffmpeg).
// Every sound is synthesized here from scratch (sine tones, a plucked-string model and filtered
// noise), so they are original and free to ship. Deterministic: same output on every run.
//
//   node scripts/gen-sfx.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RATE = 22050;
const OUT = path.join(import.meta.dirname, "..", "public", "sfx");

// Seeded noise so the files never change between runs.
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

const buf = (secs) => new Float32Array(Math.ceil(secs * RATE));

/** Add a sine tone with a quick attack and exponential decay. */
function tone(out, { at = 0, freq, dur, gain = 0.3, decay = 6, glide = 0, type = "sine" }) {
  const start = Math.floor(at * RATE);
  const n = Math.floor(dur * RATE);
  let phase = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / RATE;
    const f = freq * (1 + glide * t);
    phase += (2 * Math.PI * f) / RATE;
    const attack = Math.min(1, t / 0.006);
    const env = attack * Math.exp(-decay * t);
    const w =
      type === "triangle"
        ? (2 / Math.PI) * Math.asin(Math.sin(phase))
        : Math.sin(phase) + 0.18 * Math.sin(2 * phase) + 0.06 * Math.sin(3 * phase);
    out[start + i] += gain * env * w;
  }
}

/** Plucked string (Karplus-Strong): an ektara-like twang. */
function pluck(out, { at = 0, freq, dur = 1, gain = 0.35, damp = 0.996 }) {
  const start = Math.floor(at * RATE);
  const period = Math.max(2, Math.round(RATE / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = rand();
  let idx = 0;
  const n = Math.floor(dur * RATE);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % period];
    ring[idx] = damp * 0.5 * (a + b);
    out[start + i] += gain * a;
    idx = (idx + 1) % period;
  }
}

/** A short hand-drum tap: a falling-pitch body plus a click of noise. */
function drum(out, { at = 0, freq = 180, gain = 0.5, dur = 0.35 }) {
  tone(out, { at, freq, dur, gain, decay: 14, glide: -1.2 });
  const start = Math.floor(at * RATE);
  let lp = 0;
  for (let i = 0; i < 0.03 * RATE && start + i < out.length; i++) {
    lp += 0.35 * (rand() - lp);
    out[start + i] += gain * 0.5 * lp * Math.exp(-120 * (i / RATE));
  }
}

/** Soft shimmer of filtered noise (for the freeze). */
function shimmer(out, { at = 0, dur = 0.6, gain = 0.12 }) {
  const start = Math.floor(at * RATE);
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < dur * RATE && start + i < out.length; i++) {
    const x = rand();
    hp = 0.92 * (hp + x - prev);
    prev = x;
    const t = i / RATE;
    out[start + i] += gain * hp * Math.sin((Math.PI * t) / dur);
  }
}

// Notes of a bright pentatonic scale (Sa Re Ga Pa Dha) around C5.
const N = { sa: 523.25, re: 587.33, ga: 659.25, pa: 783.99, dha: 880.0, sa2: 1046.5, re2: 1174.66, ga2: 1318.51 };

const SOUNDS = {
  correct(o) {
    tone(o, { freq: N.ga, dur: 0.18, gain: 0.22, decay: 14, type: "triangle" });
    tone(o, { at: 0.08, freq: N.sa2, dur: 0.3, gain: 0.24, decay: 9, type: "triangle" });
    return 0.42;
  },
  wrong(o) {
    tone(o, { freq: 233, dur: 0.28, gain: 0.25, decay: 8, glide: -0.25 });
    tone(o, { at: 0.12, freq: 196, dur: 0.32, gain: 0.2, decay: 8, glide: -0.2 });
    return 0.5;
  },
  combo(o) {
    [N.pa, N.dha, N.sa2].forEach((f, i) => tone(o, { at: i * 0.06, freq: f, dur: 0.22, gain: 0.2, decay: 12, type: "triangle" }));
    return 0.4;
  },
  complete(o) {
    drum(o, { freq: 170 });
    [N.sa, N.ga, N.pa, N.sa2].forEach((f, i) => pluck(o, { at: 0.05 + i * 0.11, freq: f, dur: 1.1, gain: 0.32 }));
    return 1.4;
  },
  streak(o) {
    drum(o, { freq: 150, gain: 0.45 });
    drum(o, { at: 0.16, freq: 210, gain: 0.35 });
    [N.pa, N.sa2, N.ga2].forEach((f, i) => pluck(o, { at: 0.25 + i * 0.13, freq: f, dur: 1.2, gain: 0.3 }));
    return 1.5;
  },
  coin(o) {
    tone(o, { freq: N.re2, dur: 0.1, gain: 0.18, decay: 20, type: "triangle" });
    tone(o, { at: 0.06, freq: N.ga2 * 1.25, dur: 0.35, gain: 0.2, decay: 10, type: "triangle" });
    return 0.42;
  },
  chest(o) {
    drum(o, { freq: 120, gain: 0.5 });
    [N.sa, N.re, N.ga, N.pa, N.dha, N.sa2].forEach((f, i) => tone(o, { at: 0.12 + i * 0.05, freq: f * 2, dur: 0.3, gain: 0.14, decay: 10, type: "triangle" }));
    pluck(o, { at: 0.45, freq: N.sa2, dur: 1, gain: 0.3 });
    return 1.4;
  },
  freeze(o) {
    shimmer(o, { dur: 0.7 });
    [N.ga2, N.sa2, N.dha].forEach((f, i) => tone(o, { at: 0.05 + i * 0.1, freq: f * 1.5, dur: 0.5, gain: 0.1, decay: 5 }));
    return 0.9;
  },
  tap(o) {
    drum(o, { freq: 320, gain: 0.25, dur: 0.12 });
    return 0.15;
  },
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const o = buf(2);
  const len = make(o);
  const s = o.subarray(0, Math.ceil(len * RATE));
  // Normalize to -3 dB peak and fade the last 20 ms.
  let peak = 0;
  for (const x of s) peak = Math.max(peak, Math.abs(x));
  const k = peak > 0 ? 0.7 / peak : 1;
  const fade = Math.floor(0.02 * RATE);
  for (let i = 0; i < s.length; i++) s[i] *= k * Math.min(1, (s.length - i) / fade);
  const tmp = path.join(OUT, `${name}.wav`);
  const file = path.join(OUT, `${name}.mp3`);
  fs.writeFileSync(tmp, wav(s));
  // Constant bitrate, no metadata, so the bytes are the same on every run.
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-map_metadata", "-1", "-write_xing", "0", "-id3v2_version", "0", file]);
  fs.rmSync(tmp);
  console.log(`${name}.mp3  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
}
