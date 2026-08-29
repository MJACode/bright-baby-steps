import { describe, it, expect } from "vitest";
import {
  ANALYSIS_WINDOW_S,
  pickLoudestWindow,
  extractFeatures,
} from "@/lib/cryFeatures";

const SR = 8000; // low rate keeps the fixtures small; the helper is rate-agnostic

/** Sine tone of `amp` amplitude, `seconds` long. */
function tone(seconds: number, amp: number, hz = 400): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR);
  }
  return out;
}

function concat(...parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("pickLoudestWindow", () => {
  it("returns the buffer untouched when it is shorter than the window", () => {
    const short = tone(3, 0.5);
    expect(pickLoudestWindow(short, SR)).toBe(short);
  });

  it("returns the buffer untouched when it exactly fills the window", () => {
    const exact = tone(ANALYSIS_WINDOW_S, 0.5);
    expect(pickLoudestWindow(exact, SR)).toBe(exact);
  });

  it("trims a long clip down to exactly one window", () => {
    const long = concat(tone(30, 0.01), tone(8, 0.8), tone(30, 0.01));
    const picked = pickLoudestWindow(long, SR);
    expect(picked.length).toBe(ANALYSIS_WINDOW_S * SR);
  });

  it("lands on the loud stretch buried in a quiet clip", () => {
    // 40s of near-silence, 8s of crying at 20s in, then more near-silence.
    const long = concat(tone(20, 0.005), tone(8, 0.8), tone(20, 0.005));
    const picked = pickLoudestWindow(long, SR);

    let peak = 0;
    for (let i = 0; i < picked.length; i++) peak = Math.max(peak, Math.abs(picked[i]));
    expect(peak).toBeGreaterThan(0.5);

    // The quiet head would have washed the loudness out entirely.
    expect(extractFeatures(picked, SR).rms_mean).toBeGreaterThan(
      extractFeatures(long, SR).rms_mean
    );
  });

  it("stays in bounds when the loudest stretch runs to the very end", () => {
    const long = concat(tone(20, 0.005), tone(8, 0.8));
    const picked = pickLoudestWindow(long, SR);
    expect(picked.length).toBe(ANALYSIS_WINDOW_S * SR);
    expect(picked[picked.length - 1]).toBeDefined();
    let peak = 0;
    for (let i = 0; i < picked.length; i++) peak = Math.max(peak, Math.abs(picked[i]));
    expect(peak).toBeGreaterThan(0.5);
  });

  it("honours a custom window length", () => {
    const long = tone(30, 0.5);
    expect(pickLoudestWindow(long, SR, 2).length).toBe(2 * SR);
  });
});
