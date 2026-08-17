/** Phase 2 acceptance test: a splat field built from the image-source field
 * renders through the EXISTING renderer without contract changes. */
import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import { DefaultAcousticEngine, FdnReverbSystem, ImageSourceSolver, SplatFieldSolver } from "../acoustic_engine";
import { createAudioBlock } from "../dsp";
import { OfflineAcousticRenderer, SimpleBinauralRenderer, SphericalHeadHrtf } from "../renderer";
import { projectFieldToSplats, sampleFieldWithImageSource, voxelizeDirectionalField } from "../../tools/dataset";

describe("Phase 2 splat-field pipeline", () => {
  it("builds a splat field and renders it binaurally through the Phase 1 renderer", async () => {
    const scene = buildShoeboxScene();
    const sampleRate = 48000;
    const grid = {
      resolution: [3, 2, 2] as [number, number, number],
      voxelSizeMeters: 5 / 3,
      origin: { x: 0, y: 0, z: 0 },
    };
    const probes: { x: number; y: number; z: number }[] = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          probes.push({
            x: (x + 0.5) * (5 / 3),
            y: (y + 0.5) * 2,
            z: (z + 0.5) * 1.5,
          });
        }
      }
    }

    const samples = await sampleFieldWithImageSource(scene, "e1", probes, 2);
    const field = voxelizeDirectionalField(samples, grid, 3);
    const splats = projectFieldToSplats(field);
    expect(splats.primitives.length).toBeGreaterThan(0);
    scene.splatFields = [splats];

    const engine = new DefaultAcousticEngine({
      reverb: new FdnReverbSystem(),
      solvers: [new ImageSourceSolver(), new SplatFieldSolver()],
    });
    const renderer = new OfflineAcousticRenderer({
      engine,
      binaural: new SimpleBinauralRenderer(),
      simulation: { solver: "splat-field", sampleRate, lateFieldDurationSeconds: 0 },
    });
    const hrtf = new SphericalHeadHrtf(sampleRate);

    const baked = await renderer.bake(scene, hrtf);
    expect(baked.dirs.size).toBe(1);

    const source = createAudioBlock(1, Math.round(sampleRate * 0.5), sampleRate);
    source.channels[0][0] = 1;
    const out = await renderer.render(
      { baked, listenerId: "l1", sources: new Map([["e1", source]]) },
      hrtf,
      sampleRate
    );

    expect(out.channels).toHaveLength(2);
    let energy = 0;
    for (const channel of out.channels) {
      for (let i = 0; i < channel.length; i++) {
        expect(Number.isFinite(channel[i])).toBe(true);
        energy += channel[i] * channel[i];
      }
    }
    expect(energy).toBeGreaterThan(1e-6);
  });
});
