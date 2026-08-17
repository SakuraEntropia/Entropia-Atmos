import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import { ImageSourceSolver } from "./solvers/imageSource";
import { RayTracingSolver } from "./solvers/rayTracing";
import type { RayTracingMesh } from "./solvers/rayTracing";
import type { SimulationRequest } from "./acousticEngine";

/** The shoebox as a 12-triangle mesh (winding-independent: normals are
 * flipped toward the ray). */
const BOX_OBJ = `
v 0 0 0
v 5 0 0
v 5 0 3
v 0 0 3
v 0 4 0
v 5 4 0
v 5 4 3
v 0 4 3
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

function meshScene() {
  const scene = buildShoeboxScene();
  scene.geometry = [{ assetId: "box", materialId: "concrete", transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } } }];
  return scene;
}

function meshFromObj(obj: string): RayTracingMesh {
  const positions: number[] = [];
  const triangles: number[] = [];
  for (const raw of obj.trim().split("\n")) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === "v") positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    else if (parts[0] === "f") {
      const idx = parts.slice(1).map((t) => Number(t.split("/")[0]) - 1);
      for (let i = 1; i < idx.length - 1; i++) triangles.push(idx[0], idx[i], idx[i + 1]);
    }
  }
  return { positions: Float32Array.from(positions), triangles: Uint32Array.from(triangles) };
}

function energyOf(dir: { early: { samples: Float32Array }[] }): number {
  let energy = 0;
  for (const path of dir.early) for (const v of path.samples) energy += v * v;
  return energy;
}

describe("RayTracingSolver (general geometry)", () => {
  it("matches the image-source direct path exactly", async () => {
    const scene = meshScene();
    const request: SimulationRequest = {
      scene,
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "ray-tracing", maxReflectionOrder: 1, sampleRate: 48000, rayBudget: 2000 },
    };
    const dir = await new RayTracingSolver(new Map([["box", meshFromObj(BOX_OBJ)]])).simulate(request);
    const direct = dir.early.find(
      (p) => p.materialHits.length === 0 && Math.abs(p.distanceMeters - Math.sqrt(8)) < 1e-3
    );
    expect(direct).toBeDefined();
    expect(direct!.distanceMeters).toBeCloseTo(Math.sqrt(8), 6);
    expect(direct!.gain).toBeCloseTo(1 / Math.sqrt(8), 3);
    expect(direct!.bandGains).toHaveLength(4);
  });

  it("reconstructs first-order reflection energy within a factor of two of image source", async () => {
    const scene = meshScene();
    const reference = await new ImageSourceSolver().simulate({
      scene: buildShoeboxScene(),
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "image-source", maxReflectionOrder: 1, sampleRate: 48000 },
    });
    const referenceFirstOrder = energyOf({ early: reference.early.filter((p) => p.materialHits.length === 1) });

    const rayDir = await new RayTracingSolver(new Map([["box", meshFromObj(BOX_OBJ)]])).simulate({
      scene,
      emitterId: "e1",
      listenerId: "l1",
      options: { solver: "ray-tracing", maxReflectionOrder: 1, sampleRate: 48000, rayBudget: 6000 },
    });
    const rayFirstOrder = energyOf({ early: rayDir.early.filter((p) => p.materialHits.length === 1) });

    expect(rayDir.early.length).toBeGreaterThan(1); // direct + some reflections
    expect(rayFirstOrder / referenceFirstOrder).toBeGreaterThan(0.3);
    expect(rayFirstOrder / referenceFirstOrder).toBeLessThan(3);
  });

  it("rejects scenes without geometry", async () => {
    const scene = buildShoeboxScene(); // has room but no geometry refs
    await expect(
      new RayTracingSolver(new Map()).simulate({
        scene,
        emitterId: "e1",
        listenerId: "l1",
        options: { solver: "ray-tracing", maxReflectionOrder: 1, sampleRate: 48000 },
      })
    ).rejects.toThrow(/scene geometry/);
  });
});
