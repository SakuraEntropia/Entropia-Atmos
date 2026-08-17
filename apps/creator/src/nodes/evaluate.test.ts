import { describe, expect, it } from "vitest";
import { evaluateGraph, type NodeGraph, type SampleContext } from "./evaluate";
import { fbm, noise2D } from "./noise";
import { NODE_DEFS } from "./nodeDefs";

const CTX: SampleContext = {
  u: 0.5,
  v: 0.5,
  world: { x: 1, y: 2, z: 3 },
  band: 1,
  time: 0,
  images: {},
  videos: {},
};

describe("noise", () => {
  it("is deterministic and bounded", () => {
    const a = noise2D(3.7, 8.1, 42);
    const b = noise2D(3.7, 8.1, 42);
    expect(a).toBe(b);
    for (let i = 0; i < 100; i++) {
      const n = noise2D(i * 0.13, i * 0.71, 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it("fbm stays in [-1, 1]", () => {
    for (let i = 0; i < 50; i++) {
      const n = fbm(i * 0.3, i * 0.5, 4, 3);
      expect(Math.abs(n)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("node evaluation engine", () => {
  it("evaluates value and math nodes", () => {
    const graph: NodeGraph = {
      nodes: [
        { id: "v1", type: "value", params: { value: 3 } },
        { id: "v2", type: "value", params: { value: 4 } },
        { id: "add", type: "mathAdd", params: {} },
        { id: "out", type: "absorptionOutput", params: {} },
      ],
      edges: [
        { from: { nodeId: "v1", socket: "value" }, to: { nodeId: "add", socket: "a" } },
        { from: { nodeId: "v2", socket: "value" }, to: { nodeId: "add", socket: "b" } },
        { from: { nodeId: "add", socket: "result" }, to: { nodeId: "out", socket: "value" } },
      ],
    };
    const outputs = evaluateGraph(graph, CTX);
    const values = Object.values(outputs);
    expect(values).toHaveLength(1);
    expect(values[0].absorption).toBeCloseTo(1, 5); // clamped to [0,1]
  });

  it("evaluates perlin noise through the texture coordinate", () => {
    const graph: NodeGraph = {
      nodes: [
        { id: "tc", type: "textureCoordinate", params: {} },
        { id: "noise", type: "perlinNoise", params: { scale: 4, octaves: 2, seed: 11 } },
        { id: "out", type: "absorptionOutput", params: {} },
      ],
      edges: [
        { from: { nodeId: "tc", socket: "world" }, to: { nodeId: "noise", socket: "vector" } },
        { from: { nodeId: "noise", socket: "value" }, to: { nodeId: "out", socket: "value" } },
      ],
    };
    const outputs = evaluateGraph(graph, CTX);
    const absorption = Object.values(outputs)[0].absorption;
    expect(absorption).toBeGreaterThanOrEqual(0);
    expect(absorption).toBeLessThanOrEqual(1);
  });

  it("detects cycles", () => {
    const graph: NodeGraph = {
      nodes: [
        { id: "a", type: "mathAdd", params: {} },
        { id: "b", type: "mathAdd", params: {} },
      ],
      edges: [
        { from: { nodeId: "a", socket: "result" }, to: { nodeId: "b", socket: "a" } },
        { from: { nodeId: "b", socket: "result" }, to: { nodeId: "a", socket: "a" } },
      ],
    };
    expect(() => evaluateGraph(graph, CTX)).toThrow(/cycle/);
  });

  it("vector math and combine/separate round-trip", () => {
    const graph: NodeGraph = {
      nodes: [
        { id: "c", type: "combineXyz", params: {} },
        { id: "v1", type: "value", params: { value: 0.25 } },
        { id: "s", type: "separateXyz", params: {} },
        { id: "out", type: "absorptionOutput", params: {} },
      ],
      edges: [
        { from: { nodeId: "v1", socket: "value" }, to: { nodeId: "c", socket: "x" } },
        { from: { nodeId: "c", socket: "vector" }, to: { nodeId: "s", socket: "vector" } },
        { from: { nodeId: "s", socket: "x" }, to: { nodeId: "out", socket: "value" } },
      ],
    };
    const outputs = evaluateGraph(graph, CTX);
    expect(Object.values(outputs)[0].absorption).toBeCloseTo(0.25, 5);
  });

  it("ships every declared node category and definition", () => {
    const categories = new Set(NODE_DEFS.map((d) => d.category));
    expect(categories.has("Input")).toBe(true);
    expect(categories.has("Texture")).toBe(true);
    expect(categories.has("Math")).toBe(true);
    expect(categories.has("Vector")).toBe(true);
    expect(categories.has("Output")).toBe(true);
    expect(NODE_DEFS.length).toBeGreaterThanOrEqual(18);
  });
});
