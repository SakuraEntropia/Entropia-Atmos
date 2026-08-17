import { describe, expect, it } from "vitest";
import { SphericalHeadHrtf } from "./hrtf/sphericalHead";
import { createJsonHrtf } from "./hrtf/jsonHrtf";

/** argmax over τ of Σ a[n]·b[n+τ]. */
function argmaxCrossCorrelation(a: Float32Array, b: Float32Array, maxLag: number): number {
  let best = 0;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let n = 0; n < a.length; n++) {
      const m = n + lag;
      if (m >= 0 && m < b.length) sum += a[n] * b[m];
    }
    if (sum > bestValue) {
      bestValue = sum;
      best = lag;
    }
  }
  return best;
}

describe("SphericalHeadHrtf", () => {
  const SAMPLE_RATE = 48000;

  it("implements the Woodworth ITD for a lateral source", () => {
    const hrtf = new SphericalHeadHrtf(SAMPLE_RATE);
    const radius = 0.0875;
    const expected = Math.round((radius / 343) * (Math.PI / 2 + 1) * SAMPLE_RATE);

    const right = hrtf.query(Math.PI / 2, 0)!; // source on the right
    const lag = argmaxCrossCorrelation(right.left, right.right, 64);
    expect(lag).toBe(-expected); // left ear lags the right ear

    const left = hrtf.query(-Math.PI / 2, 0)!;
    const lagLeft = argmaxCrossCorrelation(left.left, left.right, 64);
    expect(lagLeft).toBe(expected);
  });

  it("is symmetric and frontal for a front source", () => {
    const hrtf = new SphericalHeadHrtf(SAMPLE_RATE);
    const front = hrtf.query(0, 0)!;
    expect(front.left[0]).toBe(1);
    expect(front.right[0]).toBe(1);
  });
});

describe("createJsonHrtf", () => {
  it("looks up the nearest entry by direction", () => {
    const hrtf = createJsonHrtf("test", {
      sampleRate: 48000,
      entries: [
        { azimuthDegrees: 0, elevationDegrees: 0, left: [1], right: [1] },
        { azimuthDegrees: 90, elevationDegrees: 0, left: [2], right: [2] },
      ],
    });
    expect(Array.from(hrtf.query(0, 0)!.left)).toEqual([1]);
    expect(Array.from(hrtf.query(Math.PI / 2, 0)!.left)).toEqual([2]);
    expect(Array.from(hrtf.query(Math.PI, 0)!.left)).toEqual([2]); // nearest = 90°
  });

  it("returns undefined for an empty bank", () => {
    const hrtf = createJsonHrtf("empty", { sampleRate: 48000, entries: [] });
    expect(hrtf.query(0, 0)).toBeUndefined();
  });
});
