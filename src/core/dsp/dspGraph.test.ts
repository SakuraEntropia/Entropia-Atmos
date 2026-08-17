import { describe, expect, it } from "vitest";
import type { AudioBlock } from "./audioBlock";
import { createAudioBlock } from "./audioBlock";
import type { DspContext, DspNode } from "./dspNode";
import { DspGraph } from "./dspGraph";
import { SourceNode } from "./nodes/sourceNode";
import { GainNode } from "./nodes/gainNode";
import { SumNode } from "./nodes/sumNode";
import { ConvolverNode } from "./nodes/convolverNode";

function passThrough(id: string): DspNode {
  return {
    id,
    inputs: ["in"],
    outputs: ["out"],
    process: (inputs) => ({ out: inputs["in"] }),
  };
}

const CONTEXT: DspContext = { sampleRate: 48000, blockSize: 512, timeSeconds: 0 };

/** Execute a graph topologically; returns each node's output ports. */
function execute(graph: DspGraph, nodes: Map<string, DspNode>): Map<string, Record<string, AudioBlock>> {
  const outputs = new Map<string, Record<string, AudioBlock>>();
  const values = new Map<string, AudioBlock>();
  for (const id of graph.plan().order) {
    const node = nodes.get(id)!;
    const inputs: Record<string, AudioBlock> = {};
    for (const edge of graph.edges) {
      if (edge.to.nodeId === id) {
        inputs[edge.to.port] = values.get(`${edge.from.nodeId}:${edge.from.port}`)!;
      }
    }
    const result = node.process(inputs, CONTEXT);
    outputs.set(id, result);
    for (const [port, block] of Object.entries(result)) values.set(`${id}:${port}`, block);
  }
  return outputs;
}

describe("DspGraph.plan", () => {
  it("orders a chain topologically", () => {
    const graph = new DspGraph();
    graph.addNode(passThrough("a"));
    graph.addNode(passThrough("b"));
    graph.addNode(passThrough("c"));
    graph.connect({ nodeId: "a", port: "out" }, { nodeId: "b", port: "in" });
    graph.connect({ nodeId: "b", port: "out" }, { nodeId: "c", port: "in" });
    expect(graph.plan().order).toEqual(["a", "b", "c"]);
  });

  it("rejects cycles", () => {
    const graph = new DspGraph();
    graph.addNode(passThrough("a"));
    graph.addNode(passThrough("b"));
    graph.connect({ nodeId: "a", port: "out" }, { nodeId: "b", port: "in" });
    graph.connect({ nodeId: "b", port: "out" }, { nodeId: "a", port: "in" });
    expect(() => graph.plan()).toThrow(/cycle/);
  });

  it("rejects unknown endpoints", () => {
    const graph = new DspGraph();
    graph.addNode(passThrough("a"));
    expect(() => graph.connect({ nodeId: "a", port: "out" }, { nodeId: "nope", port: "in" })).toThrow(/unknown node/);
  });
});

describe("node library", () => {
  it("source → gain → sum produces expected samples", () => {
    const source = createAudioBlock(1, 2, 48000);
    source.channels[0].set([1, 2]);

    const sourceNode = new SourceNode("src", source);
    const gainNode = new GainNode("gain", 2);
    const sumNode = new SumNode("sum", 2);
    const nodes = new Map<string, DspNode>([
      [sourceNode.id, sourceNode],
      [gainNode.id, gainNode],
      [sumNode.id, sumNode],
    ]);
    const graph = new DspGraph();
    for (const node of nodes.values()) graph.addNode(node);
    graph.connect({ nodeId: "src", port: "out" }, { nodeId: "gain", port: "in" });
    graph.connect({ nodeId: "gain", port: "out" }, { nodeId: "sum", port: "in1" });
    graph.connect({ nodeId: "src", port: "out" }, { nodeId: "sum", port: "in2" });

    const outputs = execute(graph, nodes);
    const sum = outputs.get("sum")!["out"];
    expect(Array.from(sum.channels[0])).toEqual([3, 6]); // 2×[1,2] + [1,2]
  });

  it("convolver applies a stereo kernel to a mono input", () => {
    const source = createAudioBlock(1, 3, 48000);
    source.channels[0].set([1, 0, 0]);

    const kernel = createAudioBlock(2, 2, 48000);
    kernel.channels[0].set([1, 0]);
    kernel.channels[1].set([0.5, 0]);

    const node = new ConvolverNode("conv", kernel);
    const out = node.process({ in: source }, CONTEXT)["out"];
    expect(out.channels.length).toBe(2);
    // Convolution output length is always N + M − 1.
    expect(Array.from(out.channels[0])).toEqual([1, 0, 0, 0]);
    expect(Array.from(out.channels[1])).toEqual([0.5, 0, 0, 0]);
  });
});
