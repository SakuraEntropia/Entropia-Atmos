import { describe, expect, it } from "vitest";
import { parseAudioUsd } from "./loader";
import { serializeAudioUsd } from "./writer";
import { createDocument, toAudioScene, type AudioUsdDocument } from "./audioUsdDocument";
import { buildShoeboxScene } from "../../testing/shoeboxFixture";

describe("Audio-USD round-trip", () => {
  it("serializes and parses a document losslessly", () => {
    const document: AudioUsdDocument = createDocument("y", 1);
    document.name = "round-trip";
    document.layers.push({
      name: "main",
      prims: [{ type: "emitter", id: "e1", name: "Speaker", payload: { kind: "point" } }],
    });
    const parsed = parseAudioUsd(serializeAudioUsd(document));
    expect(parsed.schemaVersion).toBe(document.schemaVersion);
    expect(parsed.name).toBe("round-trip");
    expect(parsed.upAxis).toBe("y");
    expect(parsed.unitsPerMeter).toBe(1);
    expect(parsed.layers[0].prims[0].id).toBe("e1");
    expect(parsed.layers[0].prims[0].payload).toEqual({ kind: "point" });
  });

  it("rejects an unknown schema major version", () => {
    const json = `{ "schemaVersion": "9.9.9", "upAxis": "y", "unitsPerMeter": 1, "layers": [] }`;
    expect(() => parseAudioUsd(json)).toThrow(/unsupported Audio-USD schema/);
  });
});

describe("toAudioScene mapping (v0 schema)", () => {
  it("maps every prim type and the room descriptor", () => {
    const scene = buildShoeboxScene();
    expect(scene.name).toBe("shoebox");
    expect(scene.emitters).toHaveLength(1);
    expect(scene.emitters[0].kind).toBe("point");
    expect(scene.emitters[0].transform.position).toEqual({ x: 1, y: 1, z: 1.5 });
    expect(scene.listeners).toHaveLength(1);
    expect(scene.materials[0].bands[0].absorption).toBe(0.08);
    expect(scene.environments[0].temperatureCelsius).toBe(20);
    expect(scene.room?.max).toEqual({ x: 5, y: 4, z: 3 });
  });

  it("rejects materials whose band coefficients exceed 1", () => {
    const json = `{
      "schemaVersion": "0.1.0", "upAxis": "y", "unitsPerMeter": 1,
      "layers": [{ "name": "main", "prims": [
        { "type": "material", "id": "m", "name": "M", "payload": {
          "bands": [{ "centerHz": 1000, "lowHz": 710, "highHz": 1420, "absorption": 0.9, "scattering": 0.9, "transmission": 0 }]
        } }
      ] }]
    }`;
    expect(() => toAudioScene(parseAudioUsd(json))).toThrow(/≤ 1/);
  });

  it("rejects a degenerate room box", () => {
    const json = `{
      "schemaVersion": "0.1.0", "upAxis": "y", "unitsPerMeter": 1,
      "room": { "min": [0, 0, 0], "max": [0, 4, 3] },
      "layers": []
    }`;
    expect(() => toAudioScene(parseAudioUsd(json))).toThrow(/room/);
  });

  it("rejects unknown prim types", () => {
    const document = createDocument();
    document.layers.push({
      name: "main",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prims: [{ type: "banana" as any, id: "b", name: "B", payload: {} }],
    });
    expect(() => toAudioScene(document)).toThrow(/unknown prim type/);
  });
});
