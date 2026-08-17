import { describe, expect, it } from "vitest";
import { LodStreamer, selectLod, streamLods } from "./streaming";
import type { SplatManifest } from "./fieldSynthesis";
import type { SplatLevel } from "./pipeline";

const MANIFEST: SplatManifest = {
  splatCount: 60,
  fullBandCount: 4,
  levels: [
    { level: 0, shBands: 1, splatCount: 60, bytesApprox: 1200, errorDb: -8.4 },
    { level: 1, shBands: 2, splatCount: 60, bytesApprox: 1900, errorDb: -10.2 },
    { level: 2, shBands: 3, splatCount: 60, bytesApprox: 3000, errorDb: -12.0 },
    { level: 3, shBands: 4, splatCount: 60, bytesApprox: 4700, errorDb: -120 },
  ],
};

function level(bands: number): SplatLevel {
  return { level: 0, shBands: bands, primitives: [] };
}

describe("LOD selection (Phase 3 streaming)", () => {
  it("picks the cheapest level within the error budget", () => {
    // Budget semantics: error must be ≤ budget (more negative = stricter).
    expect(selectLod(MANIFEST, -4)).toBe(1); // loose budget → 1 band
    expect(selectLod(MANIFEST, -8)).toBe(1);
    expect(selectLod(MANIFEST, -11)).toBe(3);
    expect(selectLod(MANIFEST, -200)).toBe(4); // impossibly strict → best level
  });

  it("streams the selected level on demand", async () => {
    const levels = [level(1), level(2), level(3), level(4)];
    const stream = streamLods(MANIFEST, levels, { x: 1, y: 1, z: 1 }, -11);
    const first = await stream.next();
    expect(first.value.shBands).toBe(3);
    const second = await stream.next();
    expect(second.value.shBands).toBe(3);
  });

  it("falls back to the best available level when the manifest band is missing", () => {
    const streamer = new LodStreamer(MANIFEST, [level(1), level(2)], { errorBudgetDb: -200 });
    expect(streamer.selectFor({ x: 0, y: 0, z: 0 }).shBands).toBe(2);
  });
});
