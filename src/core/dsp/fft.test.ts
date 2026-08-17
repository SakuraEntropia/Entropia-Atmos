import { describe, expect, it } from "vitest";
import { directConvolve, fftConvolve } from "./fft";

function rand(length: number, seed: number): Float32Array {
  const out = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out[i] = (s / 2147483648) * 2 - 1;
  }
  return out;
}

describe("fftConvolve", () => {
  it("matches direct convolution on random signals", () => {
    const signal = rand(1000, 7);
    const kernel = rand(64, 42);
    const fast = fftConvolve(signal, kernel);
    const slow = directConvolve(signal, kernel);
    expect(fast.length).toBe(slow.length);
    let maxError = 0;
    for (let i = 0; i < fast.length; i++) {
      maxError = Math.max(maxError, Math.abs(fast[i] - slow[i]));
    }
    expect(maxError).toBeLessThan(1e-4);
  });

  it("is the identity when the kernel is an impulse", () => {
    const signal = rand(500, 3);
    const kernel = new Float32Array(1);
    kernel[0] = 1;
    const out = fftConvolve(signal, kernel);
    expect(out.length).toBe(signal.length);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(signal[i], 6);
  });

  it("computes a tiny convolution correctly", () => {
    const out = fftConvolve(Float32Array.from([1, 2, 3]), Float32Array.from([1, 1]));
    expect(out.length).toBe(4);
    [1, 3, 5, 3].forEach((expected, i) => expect(out[i]).toBeCloseTo(expected, 4));
  });
});
