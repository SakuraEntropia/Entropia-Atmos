import { describe, expect, it } from "vitest";
import { SplatFieldConverter } from "./splatFieldConverter";
import { ConverterRegistry } from "./converters";
import { parseAudioUsd, serializeAudioUsd, toAudioScene } from "../../formats/audio_usd";
import type { SplatField } from "../../core/audio_scene";

const FIELD: SplatField = {
  primitives: [
    {
      position: { x: 1, y: 2, z: 3 },
      scale: { x: 0.5, y: 0.5, z: 0.5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      opacity: 1.5,
      shCoefficients: Float32Array.from([0.2821, 0, 0.1, 0]),
    },
  ],
};

describe("SplatFieldConverter", () => {
  it("registers in the converter registry", () => {
    const registry = new ConverterRegistry();
    registry.register(new SplatFieldConverter());
    expect(registry.resolve("splat-field", "audio-usd")).toBeDefined();
  });

  it("round-trips a splat field through Audio-USD", async () => {
    const document = await new SplatFieldConverter().convert(FIELD);
    const scene = toAudioScene(parseAudioUsd(serializeAudioUsd(document)));
    expect(scene.splatFields).toHaveLength(1);
    const splat = scene.splatFields![0].primitives[0];
    expect(splat.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(splat.opacity).toBe(1.5);
    expect(splat.shCoefficients).toEqual(FIELD.primitives[0].shCoefficients);
  });
});
