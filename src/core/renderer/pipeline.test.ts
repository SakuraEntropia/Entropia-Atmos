/** Phase 1 acceptance test: Audio-USD scene → simulation → binaural render. */
import { describe, expect, it } from "vitest";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";
import { DefaultAcousticEngine, FdnReverbSystem, ImageSourceSolver } from "../acoustic_engine";
import { createAudioBlock } from "../dsp";
import { OfflineAcousticRenderer, SimpleBinauralRenderer, SphericalHeadHrtf } from "../renderer";

describe("Phase 1 end-to-end pipeline", () => {
  it("renders a shoebox scene to finite, binaural output", async () => {
    const scene = buildShoeboxScene();
    const sampleRate = 48000;
    const engine = new DefaultAcousticEngine({
      reverb: new FdnReverbSystem(),
      solvers: [new ImageSourceSolver()],
    });
    const renderer = new OfflineAcousticRenderer({
      engine,
      binaural: new SimpleBinauralRenderer(),
      simulation: { sampleRate, maxReflectionOrder: 2, lateFieldDurationSeconds: 0.8 },
    });
    const hrtf = new SphericalHeadHrtf(sampleRate);

    const baked = await renderer.bake(scene, hrtf);
    expect(baked.dirs.size).toBe(1);

    const source = createAudioBlock(1, Math.round(sampleRate * 0.5), sampleRate);
    source.channels[0][0] = 1; // impulse

    const out = await renderer.render(
      { baked, listenerId: "l1", sources: new Map([["e1", source]]) },
      hrtf,
      sampleRate
    );

    const expected = Math.round(sampleRate * 0.5) + Math.round(sampleRate * 0.8) - 1;
    expect(Math.abs(out.length - expected)).toBeLessThanOrEqual(2);
    expect(out.channels).toHaveLength(2);

    let energy = 0;
    let peak = 0;
    let earDifference = 0;
    for (let i = 0; i < out.length; i++) {
      const l = out.channels[0][i];
      const r = out.channels[1][i];
      expect(Number.isFinite(l)).toBe(true);
      expect(Number.isFinite(r)).toBe(true);
      energy += l * l + r * r;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      earDifference += Math.abs(l - r);
    }
    expect(energy).toBeGreaterThan(1e-4);
    expect(peak).toBeLessThan(10);
    expect(earDifference).toBeGreaterThan(1e-6); // ITD/ILD make ears differ
  });
});
