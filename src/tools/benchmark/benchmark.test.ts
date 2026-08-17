import { describe, expect, it } from "vitest";
import { measureDir, measureRender, compareBenchmarks, type BenchReport } from "./benchmark";

describe("benchmark harness", () => {
  it("measures DIR energy over early paths and the late field", () => {
    const dir = {
      sampleRate: 48000,
      durationSeconds: 0,
      early: [
        { azimuthRadians: 0, elevationRadians: 0, distanceMeters: 1, materialHits: [], samples: Float32Array.from([0, 1]), gain: 1 },
        { azimuthRadians: 1, elevationRadians: 0, distanceMeters: 2, materialHits: ["m"], samples: Float32Array.from([0, 0, 0.5]), gain: 0.5 },
      ],
      late: { bands: [], samples: Float32Array.from([0.25, 0.25]) },
    };
    const metrics = measureDir(dir);
    expect(metrics.pathCount).toBe(2);
    expect(metrics.directGain).toBe(1);
    expect(metrics.earlyEnergy).toBeCloseTo(1 + 0.25, 6);
    expect(metrics.lateEnergy).toBeCloseTo(0.125, 6);
    expect(metrics.totalEnergy).toBeCloseTo(1.375, 6);
  });

  it("measures render blocks", () => {
    const block = {
      channels: [Float32Array.from([0.5, -1]), Float32Array.from([0.5, 1])],
      sampleRate: 48000,
      length: 2,
    };
    const metrics = measureRender(block);
    expect(metrics.length).toBe(2);
    expect(metrics.energy).toBeCloseTo(2.5, 6);
    expect(metrics.peak).toBe(1);
  });

  it("compares two reports in dB", () => {
    const base: BenchReport = {
      name: "ref",
      dir: { pathCount: 1, directGain: 1, earlyEnergy: 1, lateEnergy: 0, totalEnergy: 1 },
      energyDb: 0,
    };
    const candidate: BenchReport = {
      name: "candidate",
      dir: { pathCount: 1, directGain: 0.5, earlyEnergy: 0.25, lateEnergy: 0, totalEnergy: 0.25 },
      energyDb: -6.02,
    };
    const comparison = compareBenchmarks(base, candidate);
    expect(comparison.dirEnergyDeltaDb).toBeCloseTo(-6.02, 2);
    expect(comparison.directGainDeltaDb).toBeCloseTo(-6.02, 2);
  });
});
