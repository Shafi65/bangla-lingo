import { describe, expect, it } from "vitest";
import { peaks, toMono, trimSilence } from "@/lib/speak/trim";
import { classifyMicError, pickMimeType } from "@/lib/speak/mime";
import { parseHistory, withRating } from "@/lib/speak/history";

const SR = 8000;
/** `lead` seconds of silence, `tone` seconds of a 220 Hz tone, `tail` seconds of silence. */
function clip(lead: number, tone: number, tail: number, amp = 0.5, noise = 0): Float32Array {
  const n = Math.round((lead + tone + tail) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const voiced = t >= lead && t < lead + tone;
    out[i] = (voiced ? amp * Math.sin(2 * Math.PI * 220 * t) : 0) + noise * Math.sin(i * 12.9898);
  }
  return out;
}

describe("trimSilence", () => {
  it("cuts leading and trailing silence, keeping a little padding", () => {
    const r = trimSilence(clip(0.5, 1, 0.7), SR);
    expect(r.silent).toBe(false);
    expect(r.start / SR).toBeGreaterThan(0.4);
    expect(r.start / SR).toBeLessThanOrEqual(0.5);
    expect(r.end / SR).toBeGreaterThanOrEqual(1.5);
    expect(r.end / SR).toBeLessThan(1.6);
  });

  it("ignores faint background noise around the voiced part", () => {
    const r = trimSilence(clip(0.4, 0.6, 0.4, 0.6, 0.01), SR);
    expect(r.start / SR).toBeGreaterThan(0.3);
    expect(r.end / SR).toBeLessThan(1.1);
  });

  it("keeps audio that has no silence", () => {
    const r = trimSilence(clip(0, 1, 0), SR);
    expect(r.start).toBe(0);
    expect(r.end).toBe(SR);
  });

  it("returns the whole clip, flagged silent, when there is no sound", () => {
    const r = trimSilence(new Float32Array(SR), SR);
    expect(r).toEqual({ start: 0, end: SR, silent: true });
  });

  it("copes with empty input and bad sample rates", () => {
    expect(trimSilence(new Float32Array(0), SR).silent).toBe(true);
    expect(trimSilence(clip(0.1, 0.1, 0.1), 0).silent).toBe(true);
  });

  it("never returns an empty or out-of-range span", () => {
    const r = trimSilence(clip(0.01, 0.01, 0.01), SR);
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeLessThanOrEqual(Math.round(0.03 * SR));
    expect(r.end).toBeGreaterThan(r.start);
  });
});

describe("peaks", () => {
  it("returns the requested number of bars, scaled to 1", () => {
    const p = peaks(clip(0, 1, 0, 0.25), 0, SR, 40);
    expect(p).toHaveLength(40);
    expect(Math.max(...p)).toBeCloseTo(1);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
  });
  it("is all zeros for silence or an empty span", () => {
    expect(peaks(new Float32Array(100), 0, 100, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(peaks(new Float32Array(100), 10, 10, 3)).toEqual([0, 0, 0]);
    expect(peaks(new Float32Array(100), 0, 100, 0)).toEqual([]);
  });
  it("respects the span", () => {
    const s = new Float32Array(100);
    s[90] = 1;
    expect(peaks(s, 0, 50, 2)).toEqual([0, 0]);
    expect(peaks(s, 50, 100, 1)).toEqual([1]);
  });
});

describe("toMono", () => {
  it("averages channels", () => {
    expect(Array.from(toMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5]);
  });
});

describe("pickMimeType", () => {
  it("returns the first supported candidate", () => {
    const safari = { isTypeSupported: (t: string) => t.startsWith("audio/mp4") };
    expect(pickMimeType(safari)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickMimeType({ isTypeSupported: (t) => t === "audio/webm" })).toBe("audio/webm");
  });
  it("falls back to the browser default (empty string)", () => {
    expect(pickMimeType({ isTypeSupported: () => false })).toBe("");
    expect(pickMimeType(undefined)).toBe("");
    expect(pickMimeType({})).toBe("");
    expect(pickMimeType({ isTypeSupported: () => { throw new Error("x"); } })).toBe("");
  });
});

describe("classifyMicError", () => {
  it("maps DOMException names", () => {
    expect(classifyMicError({ name: "NotAllowedError" })).toBe("denied");
    expect(classifyMicError({ name: "NotFoundError" })).toBe("no-device");
    expect(classifyMicError({ name: "NotReadableError" })).toBe("busy");
    expect(classifyMicError(new Error("x"))).toBe("other");
    expect(classifyMicError(null)).toBe("other");
  });
});

describe("history", () => {
  it("tolerates junk", () => {
    expect(parseHistory(null)).toEqual({});
    expect(parseHistory("not json")).toEqual({});
    expect(parseHistory('{"items":{"a":{"last":7},"b":null}}')).toEqual({});
  });
  it("adds ratings, keeping the last five", () => {
    let h = {};
    for (const r of [0, 1, 2, 2, 1, 0] as const) h = withRating(h, "k", r, 5);
    const k = (h as ReturnType<typeof parseHistory>).k;
    expect(k.n).toBe(6);
    expect(k.last).toBe(0);
    expect(k.recent).toEqual([1, 2, 2, 1, 0]);
    expect(parseHistory(JSON.stringify({ v: 1, items: h }))).toEqual(h);
  });
});
