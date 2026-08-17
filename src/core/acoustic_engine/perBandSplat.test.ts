import { describe, expect, it } from "vitest";
import type { SplatField } from "../../core/audio_scene";
import { SplatFieldSolver } from "./solvers/splatField";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";

const Y00 = 1 / Math.sqrt(4 * Math.PI);

describe("per-band splat rendering (0004)", () => {
  it("emits per-band gains and a band-shaped FIR", async () => {
    const scene = buildShoeboxScene();
    const field: SplatField = {
      primitives: [
        {
          position: { x: 1, y: 1, z: 1.5 },
          scale: { x: 2, y: 2, z: 2 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          shCoefficients: Float32Array.from([Y00]),
          opacity: 1,
          bandShCoefficients: [Float32Array.from([Y00]), Float32Array.from([Y00]), Float32Array.from([Y00]), Float32Array.from([Y00])],
          bandEnergies: [0.4, 0.3, 0.2, 0.1],
        },
      ],
    };
    scene.splatFields = [field];

    const dir = await new SplatFieldSolver().simulate({
      scene,
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "splat-field", maxReflectionOrder: 0, sampleRate: 48000 },
    });
    expect(dir.early).toHaveLength(1);
    const path = dir.early[0];
    expect(path.bandGains).toHaveLength(4);
    // Single splat: partition-of-unity cancels; q = 1 isotropic.
    expect(path.bandGains![0]).toBeCloseTo(Math.sqrt(0.4), 4);
    expect(path.bandGains![1]).toBeCloseTo(Math.sqrt(0.3), 4);
    expect(path.gain).toBeCloseTo(Math.sqrt(0.3), 4);
    // Band FIR = delay + filter tail.
    const delay = Math.round((path.distanceMeters / 343) * 48000);
    expect(path.samples.length).toBe(delay + 512);
  });

  it("falls back to the broadband model without band data", async () => {
    const scene = buildShoeboxScene();
    scene.splatFields = [
      {
        primitives: [
          {
            position: { x: 1, y: 1, z: 1.5 },
            scale: { x: 2, y: 2, z: 2 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            shCoefficients: Float32Array.from([Y00]),
            opacity: 1,
          },
        ],
      },
    ];
    const dir = await new SplatFieldSolver().simulate({
      scene,
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "splat-field", maxReflectionOrder: 0, sampleRate: 48000 },
    });
    const path = dir.early[0];
    expect(path.bandGains).toBeUndefined();
    expect(path.samples[path.samples.length - 1]).toBeCloseTo(1, 4);
  });
});
