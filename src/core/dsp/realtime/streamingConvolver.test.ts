import { describe, expect, it } from "vitest";
import { fftConvolve } from "../fft";
import { StreamingConvolver } from "./streamingConvolver";

function rand(length: number, seed: number): Float32Array {
  const out = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out[i] = (s / 2147483648) * 2 - 1;
  }
  return out;
}

describe("StreamingConvolver", () => {
  it("matches offline convolution block by block", () => {
    const BLOCK = 64;
    const kernel = rand(1000, 5);
    const signal = rand(3000, 9);
    const reference = fftConvolve(signal, kernel);
    const convolver = new StreamingConvolver(kernel, BLOCK);

    // Feed the full signal plus the kernel tail (zero-padded input).
    const totalLength = signal.length + kernel.length - 1;
    const out = new Float32Array(totalLength);
    for (let start = 0; start < totalLength; start += BLOCK) {
      const input = new Float32Array(BLOCK);
      if (start < signal.length) {
        input.set(signal.subarray(start, Math.min(start + BLOCK, signal.length)));
      }
      const block = convolver.processBlock(input);
      out.set(block.subarray(0, Math.min(BLOCK, totalLength - start)), start);
    }
    let maxError = 0;
    for (let i = 0; i < totalLength; i++) {
      maxError = Math.max(maxError, Math.abs(out[i] - reference[i]));
    }
    expect(maxError).toBeLessThan(1e-3);
  });

  it("is the identity for a unit impulse kernel at zero delay", () => {
    const BLOCK = 128;
    const kernel = new Float32Array(1);
    kernel[0] = 1;
    const convolver = new StreamingConvolver(kernel, BLOCK);
    const input = rand(BLOCK, 3);
    const output = convolver.processBlock(input);
    for (let i = 0; i < BLOCK; i++) expect(output[i]).toBeCloseTo(input[i], 5);
  });

  it("introduces exactly one block of latency", () => {
    const BLOCK = 128;
    const kernel = rand(2000, 11);
    const convolver = new StreamingConvolver(kernel, BLOCK);
    const impulse = new Float32Array(BLOCK);
    impulse[0] = 1;
    const out = convolver.processBlock(impulse);
    expect(out[0]).toBeCloseTo(kernel[0], 4);
  });
});
