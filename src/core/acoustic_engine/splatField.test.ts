import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import type { SplatField } from "../audio_scene";
import { SplatFieldSolver } from "./solvers/splatField";

function omnidirectionalSplat(position: { x: number; y: number; z: number }, opacity: number, sigma: number): SplatField {
  return {
    primitives: [
      {
        position,
        scale: { x: sigma, y: sigma, z: sigma },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        shCoefficients: Float32Array.from([1 / Math.sqrt(4 * Math.PI)]),
        opacity,
      },
    ],
  };
}

describe("SplatFieldSolver", () => {
  it("renders an omnidirectional splat as one energy lobe", async () => {
    const scene = buildShoeboxScene();
    scene.splatFields = [omnidirectionalSplat({ x: 1, y: 1, z: 1.5 }, 1, 2)];

    const dir = await new SplatFieldSolver().simulate({
      scene,
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "splat-field", maxReflectionOrder: 0, sampleRate: 48000 },
    });
    expect(dir.early).toHaveLength(1);
    const path = dir.early[0];
    expect(path.azimuthRadians).toBeCloseTo(Math.atan2(1 - 3, 1.5 - 1.5), 6);
    expect(path.elevationRadians).toBeCloseTo(Math.asin((1 - 3) / Math.sqrt(8)), 6);
    // Single splat: partition-of-unity normalization cancels the Gaussian
    // falloff, and the isotropic energy fraction q = 4π·(1/4π) = 1 leaves
    // energy = opacity.
    expect(path.samples[path.samples.length - 1]).toBeCloseTo(1, 4);
  });

  it("rejects scenes without splat fields", async () => {
    const scene = buildShoeboxScene();
    await expect(
      new SplatFieldSolver().simulate({
        scene,
        emitterId: "e1",
        listenerId: "l1",
        options: { solver: "splat-field", maxReflectionOrder: 0, sampleRate: 48000 },
      })
    ).rejects.toThrow(/scene.splatFields/);
  });
});
