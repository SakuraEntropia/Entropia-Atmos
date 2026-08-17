import { describe, expect, it } from "vitest";
import type { SplatField } from "../../core/audio_scene";
import {
  calibrateSplatOpacities,
  calibrationErrorDb,
  predictProbeEnergy,
  type ProbeEnergy,
} from "./calibration";

function isotropicSplat(position: { x: number; y: number; z: number }, opacity: number, sigma: number): SplatField["primitives"][0] {
  return {
    position,
    scale: { x: sigma, y: sigma, z: sigma },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    shCoefficients: Float32Array.from([1 / Math.sqrt(4 * Math.PI)]),
    opacity,
  };
}

describe("splat opacity calibration (0003)", () => {
  it("fits opacities that reproduce the probe energies", () => {
    // Two splats, two probes: a determined 2×2 linear system with a
    // non-negative solution (diagonally dominant kernels, σ = 1).
    const field: SplatField = {
      primitives: [
        isotropicSplat({ x: 0, y: 0, z: 0 }, 1, 1),
        isotropicSplat({ x: 2, y: 0, z: 0 }, 1, 1),
      ],
    };
    const probes: ProbeEnergy[] = [
      { position: { x: 0, y: 0, z: 0 }, energy: 3 },
      { position: { x: 2, y: 0, z: 0 }, energy: 7 },
    ];
    const calibrated = calibrateSplatOpacities(field, probes);
    for (const probe of probes) {
      // Ridge regularization introduces a small (≈0.1 %) bias.
      expect(predictProbeEnergy(calibrated, probe)).toBeCloseTo(probe.energy, 1);
    }
  });

  it("reduces the mean energy error versus the uncalibrated field", () => {
    const field: SplatField = {
      primitives: [
        isotropicSplat({ x: 0, y: 0, z: 0 }, 1.5, 2),
        isotropicSplat({ x: 2, y: 0, z: 0 }, 0.7, 2),
        isotropicSplat({ x: 1, y: 1, z: 0 }, 0.9, 2),
      ],
    };
    const probes: ProbeEnergy[] = [
      { position: { x: 0, y: 0, z: 0 }, energy: 2.1 },
      { position: { x: 2, y: 0, z: 0 }, energy: 1.4 },
      { position: { x: 1, y: 1, z: 0 }, energy: 1.8 },
      { position: { x: 0.5, y: 0.5, z: 0 }, energy: 1.6 },
    ];
    const before = calibrationErrorDb(field, probes);
    const calibrated = calibrateSplatOpacities(field, probes);
    const after = calibrationErrorDb(calibrated, probes);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(2); // dB of mean |error|
  });

  it("keeps opacities non-negative", () => {
    const field: SplatField = {
      primitives: [
        isotropicSplat({ x: 0, y: 0, z: 0 }, 1, 2),
        isotropicSplat({ x: 2, y: 0, z: 0 }, 1, 2),
      ],
    };
    const probes: ProbeEnergy[] = [{ position: { x: 1, y: 0, z: 0 }, energy: 1 }];
    const calibrated = calibrateSplatOpacities(field, probes);
    for (const splat of calibrated.primitives) expect(splat.opacity).toBeGreaterThanOrEqual(0);
  });
});
