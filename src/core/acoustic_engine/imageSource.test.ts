import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import { ImageSourceSolver } from "./solvers/imageSource";
import type { SimulationRequest } from "./acousticEngine";

const SAMPLE_RATE = 48000;
const SPEED_OF_SOUND = 343;

function request(maxReflectionOrder: number): SimulationRequest {
  return {
    scene: buildShoeboxScene(),
    emitterId: "e1",
    listenerId: "l1",
    options: { solver: "image-source", maxReflectionOrder, sampleRate: SAMPLE_RATE },
  };
}

describe("ImageSourceSolver", () => {
  it("computes the direct path correctly (order 0)", async () => {
    const dir = await new ImageSourceSolver().simulate(request(0));
    expect(dir.early).toHaveLength(1);
    const path = dir.early[0];

    const distance = Math.sqrt(8); // (1,1,1.5) → (3,3,1.5)
    expect(path.distanceMeters).toBeCloseTo(distance, 6);
    expect(path.azimuthRadians).toBeCloseTo(Math.atan2(1 - 3, 1.5 - 1.5), 6); // −π/2
    expect(path.elevationRadians).toBeCloseTo(Math.asin((1 - 3) / distance), 6); // −π/4

    // Gain ≈ 1/d (air absorption is negligible over ~3 m).
    expect(Math.abs(path.samples[path.samples.length - 1] * distance - 1)).toBeLessThan(0.005);

    const expectedDelay = Math.round((distance / SPEED_OF_SOUND) * SAMPLE_RATE);
    expect(path.samples.length).toBe(expectedDelay + 1);
    expect(path.materialHits).toHaveLength(0);
  });

  it("enumerates first-order reflections and applies wall absorption", async () => {
    const dir = await new ImageSourceSolver().simulate(request(1));
    expect(dir.early).toHaveLength(7); // 1 direct + 6 first-order

    for (const path of dir.early.slice(1)) {
      expect(path.distanceMeters).toBeGreaterThan(Math.sqrt(8));
      expect(path.materialHits).toHaveLength(1);
    }

    // Reflection off the x = 0 wall: image at (-1, 1, 1.5), DOA azimuth = -π/2.
    const xWall = dir.early.find(
      (p) => p.materialHits.length === 1 && Math.abs(p.azimuthRadians + Math.PI / 2) < 1e-9
    );
    expect(xWall).toBeDefined();
    const expectedDistance = Math.sqrt(4 * 4 + 2 * 2); // √20
    const expectedGain = Math.sqrt(1 - 0.08) / expectedDistance;
    expect(Math.abs(xWall!.samples[xWall!.samples.length - 1] - expectedGain)).toBeLessThan(0.005);
  });

  it("rejects scenes without a room descriptor", async () => {
    const req = request(1);
    const scene = { ...req.scene, room: undefined };
    await expect(new ImageSourceSolver().simulate({ ...req, scene })).rejects.toThrow(/scene.room/);
  });

  it("rejects unknown emitter/listener ids", async () => {
    const solver = new ImageSourceSolver();
    await expect(solver.simulate({ ...request(0), emitterId: "nope" })).rejects.toThrow(/unknown emitter/);
    await expect(solver.simulate({ ...request(0), listenerId: "nope" })).rejects.toThrow(/unknown listener/);
  });
});
