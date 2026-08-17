import { describe, expect, it } from "vitest";
import { RealtimeBinauralRenderer } from "./blockRenderer";

function rand(length: number, seed: number): Float32Array {
  const out = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out[i] = (s / 2147483648) * 2 - 1;
  }
  return out;
}

describe("RealtimeBinauralRenderer", () => {
  const BLOCK = 64;

  it("passes the initial scene IR through", () => {
    const left = new Float32Array(10);
    left[0] = 1;
    const right = new Float32Array(10);
    right[0] = 0.5;
    const renderer = new RealtimeBinauralRenderer(BLOCK, left, right);
    const input = new Float32Array(BLOCK);
    input[0] = 1;
    const out = renderer.processBlock(input);
    expect(out.left[0]).toBeCloseTo(1, 5);
    expect(out.right[0]).toBeCloseTo(0.5, 5);
  });

  it("crossfades to the new IR and settles on it", () => {
    const leftA = new Float32Array(8);
    leftA[0] = 1;
    const rightA = new Float32Array(8);
    rightA[0] = 1;
    const leftB = new Float32Array(8);
    leftB[0] = 2;
    const rightB = new Float32Array(8);
    rightB[0] = 2;

    const renderer = new RealtimeBinauralRenderer(BLOCK, leftA, rightA);
    renderer.transitionTo(leftB, rightB, 4);
    const input = new Float32Array(BLOCK);
    input[0] = 1;
    let last = 1;
    let monotonic = true;
    for (let block = 0; block < 16; block++) {
      const out = renderer.processBlock(input);
      expect(Number.isFinite(out.left[0])).toBe(true);
      if (out.left[0] < last - 1e-6) monotonic = false; // ramp must not decrease
      last = out.left[0];
    }
    expect(monotonic).toBe(true);
    expect(last).toBeCloseTo(2, 4); // settled on IR B
  });

  it("keeps processing noise without NaN", () => {
    const left = rand(200, 1);
    const right = rand(200, 2);
    const renderer = new RealtimeBinauralRenderer(BLOCK, left, right);
    for (let block = 0; block < 50; block++) {
      const out = renderer.processBlock(rand(BLOCK, block));
      for (const v of out.left) expect(Number.isFinite(v)).toBe(true);
      for (const v of out.right) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
