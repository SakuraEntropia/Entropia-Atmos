/** Acoustic material node graph evaluation engine.
 *
 * The graph is a directed acyclic graph over typed sockets. Evaluation is a
 * pure function of the graph, its parameters, and the sample context
 * (texture coordinate, world position, band, time, image/video assets).
 * Cycles are rejected; missing inputs fall back to sensible defaults.
 */

import { fbm, noise2D, noise3D } from "./noise";
import { getNodeDef } from "./nodeDefs";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface SampleContext {
  /** Texture coordinate u ∈ [0,1], v ∈ [0,1]. */
  u: number;
  v: number;
  /** World position at the sample point (meters). */
  world: Vec3Like;
  /** Analysis band index (0 = 500 Hz … 3 = 4000 Hz). */
  band: number;
  /** Time in seconds (animated textures). */
  time: number;
  /** Imported image assets keyed by node id (grayscale ImageData). */
  images: Record<string, { data: Uint8ClampedArray; width: number; height: number }>;
  /** Imported video elements keyed by node id. */
  videos: Record<string, HTMLVideoElement>;
}

export type Value =
  | { kind: "S"; value: number }
  | { kind: "V"; value: Vec3Like }
  | { kind: "TC"; value: { u: number; v: number } };

export interface GraphNode {
  id: string;
  type: string;
  params: Record<string, number>;
}

export interface GraphEdge {
  from: { nodeId: string; socket: string };
  to: { nodeId: string; socket: string };
}

export interface NodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const ZERO_VEC: Vec3Like = { x: 0, y: 0, z: 0 };

function scalar(value: number): Value {
  return { kind: "S", value };
}

function vector(value: Vec3Like): Value {
  return { kind: "V", value };
}

/** Evaluate one node with its resolved inputs. */
function evalNode(node: GraphNode, inputs: Record<string, Value>, context: SampleContext): Record<string, Value> {
  const s = (name: string, fallback = 0): number => {
    const v = inputs[name];
    if (!v || v.kind !== "S") return fallback;
    return v.value;
  };
  const v3 = (name: string, fallback: Vec3Like = ZERO_VEC): Vec3Like => {
    const v = inputs[name];
    if (!v || v.kind !== "V") return fallback;
    return v.value;
  };
  const tc = (name: string): { u: number; v: number } => {
    const v = inputs[name];
    return v && v.kind === "TC" ? v.value : { u: context.u, v: context.v };
  };
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  switch (node.type) {
    case "textureCoordinate":
      return {
        uv: { kind: "TC", value: { u: context.u, v: context.v } },
        world: vector(context.world),
        band: scalar(context.band),
      };
    case "time":
      return { seconds: scalar(context.time) };
    case "value":
      return { value: scalar(node.params.value ?? 0.5) };
    case "perlinNoise": {
      const vec = v3("vector", { x: context.u, y: context.v, z: context.band });
      const scale = s("scale", node.params.scale ?? 4);
      const octaves = Math.round(node.params.octaves ?? 4);
      const seed = Math.round(node.params.seed ?? 0);
      const noise = fbm(vec.x * scale, vec.y * scale, octaves, seed);
      // 3D component adds subtle band-dependent variation.
      const bandWobble = 0.1 * (noise3D(vec.x * scale, vec.y * scale, vec.z, seed + 7) * 2 - 1);
      return { value: scalar(clamp01(0.5 + 0.5 * noise + bandWobble)) };
    }
    case "checker": {
      const vec = v3("vector", { x: context.u, y: context.v, z: 0 });
      const scale = node.params.scale ?? 4;
      const cx = Math.floor(vec.x * scale);
      const cy = Math.floor(vec.y * scale);
      return { value: scalar((cx + cy) % 2 === 0 ? 1 : 0) };
    }
    case "imageTexture": {
      const uv = tc("uv");
      const asset = context.images[node.id];
      if (!asset) return { value: scalar(0.5) };
      const px = Math.min(asset.width - 1, Math.max(0, Math.floor(uv.u * asset.width)));
      const py = Math.min(asset.height - 1, Math.max(0, Math.floor((1 - uv.v) * asset.height)));
      const index = (py * asset.width + px) * 4;
      const gray = (asset.data[index] + asset.data[index + 1] + asset.data[index + 2]) / (3 * 255);
      return { value: scalar(gray) };
    }
    case "videoTexture": {
      const uv = tc("uv");
      const video = context.videos[node.id];
      if (!video || video.readyState < 2) return { value: scalar(0.5) };
      // Sample the current frame via a shared scratch canvas.
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, video.videoWidth);
      canvas.height = Math.max(1, video.videoHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { value: scalar(0.5) };
      ctx.drawImage(video, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(uv.u * canvas.width)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.floor((1 - uv.v) * canvas.height)));
      const index = (py * canvas.width + px) * 4;
      return { value: scalar((data[index] + data[index + 1] + data[index + 2]) / (3 * 255)) };
    }
    case "mathAdd":
      return { result: scalar(s("a") + s("b")) };
    case "mathSubtract":
      return { result: scalar(s("a") - s("b")) };
    case "mathMultiply":
      return { result: scalar(s("a") * s("b")) };
    case "mathDivide": {
      const b = s("b", 1);
      return { result: scalar(b === 0 ? 0 : s("a") / b) };
    }
    case "mathPower":
      return { result: scalar(Math.pow(Math.max(0, s("base")), s("exponent", 1))) };
    case "mathSine":
      return { result: scalar(Math.sin(s("value") * Math.PI * 2) * 0.5 + 0.5) };
    case "mathClamp": {
      const min = node.params.min ?? 0;
      const max = node.params.max ?? 1;
      return { result: scalar(Math.max(min, Math.min(max, s("value")))) };
    }
    case "mathMapRange": {
      const fromMin = node.params.fromMin ?? 0;
      const fromMax = node.params.fromMax ?? 1;
      const toMin = node.params.toMin ?? 0;
      const toMax = node.params.toMax ?? 1;
      const t = fromMax === fromMin ? 0 : (s("value") - fromMin) / (fromMax - fromMin);
      return { result: scalar(toMin + t * (toMax - toMin)) };
    }
    case "mathMix": {
      const t = clamp01(s("factor", 0.5));
      return { result: scalar(s("a") * (1 - t) + s("b") * t) };
    }
    case "vectorMath": {
      const a = v3("a", { x: context.u, y: context.v, z: 0 });
      const b = v3("b");
      const op = Math.round(node.params.operation ?? 0);
      switch (op) {
        case 0: return { result: vector({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }) };
        case 1: return { result: vector({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }) };
        case 2: return { result: vector({ x: a.x * b.x, y: a.y * b.y, z: a.z * b.z }) };
        case 3: return { scalar: scalar(a.x * b.x + a.y * b.y + a.z * b.z), result: vector(ZERO_VEC) };
        case 4: return { result: vector({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }) };
        default: {
          const length = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
          return { result: vector({ x: a.x / length, y: a.y / length, z: a.z / length }), scalar: scalar(length) };
        }
      }
    }
    case "combineXyz":
      return { vector: vector({ x: s("x"), y: s("y"), z: s("z") }) };
    case "separateXyz": {
      const vec = v3("vector");
      return { x: scalar(vec.x), y: scalar(vec.y), z: scalar(vec.z) };
    }
    case "absorptionOutput":
    case "scatteringOutput":
    case "transmissionOutput":
      return { value: scalar(clamp01(s("value", 0.5))) };
    default:
      return {};
  }
}

/** Evaluate the whole graph at one sample point. Throws on cycles and on
 * unknown node types. Returns output socket values per output node. */
export function evaluateGraph(
  graph: NodeGraph,
  context: SampleContext
): Record<string, { absorption: number; scattering: number; transmission: number }> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    outgoing.set(edge.from.nodeId, [...(outgoing.get(edge.from.nodeId) ?? []), edge]);
    incoming.set(edge.to.nodeId, [...(incoming.get(edge.to.nodeId) ?? []), edge]);
  }

  // Topological order (Kahn) with cycle detection.
  const indegree = new Map(graph.nodes.map((n) => [n.id, incoming.get(n.id)?.length ?? 0]));
  const ready = graph.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.to.nodeId) ?? 1) - 1;
      indegree.set(edge.to.nodeId, next);
      if (next === 0) ready.push(edge.to.nodeId);
    }
  }
  if (order.length !== graph.nodes.length) {
    throw new Error("node graph contains a cycle");
  }

  const values = new Map<string, Record<string, Value>>();
  const outputs: Record<string, { absorption: number; scattering: number; transmission: number }> = {};
  for (const id of order) {
    const node = byId.get(id);
    if (!node) throw new Error(`unknown node '${id}'`);
    const def = getNodeDef(node.type);
    if (!def) throw new Error(`unknown node type '${node.type}'`);
    const inputs: Record<string, Value> = {};
    for (const edge of incoming.get(id) ?? []) {
      const source = values.get(edge.from.nodeId)?.[edge.from.socket];
      if (source) inputs[edge.to.socket] = source;
    }
    const result = evalNode(node, inputs, context);
    values.set(id, result);
    const scalarOut = (v: Value | undefined): number => (v && v.kind === "S" ? v.value : 0);
    if (node.type === "absorptionOutput") {
      outputs[node.id] = { ...(outputs[node.id] ?? { absorption: 0, scattering: 0, transmission: 0 }), absorption: scalarOut(result.value) };
    }
    if (node.type === "scatteringOutput") {
      outputs[node.id] = { ...(outputs[node.id] ?? { absorption: 0, scattering: 0, transmission: 0 }), scattering: scalarOut(result.value) };
    }
    if (node.type === "transmissionOutput") {
      outputs[node.id] = { ...(outputs[node.id] ?? { absorption: 0, scattering: 0, transmission: 0 }), transmission: scalarOut(result.value) };
    }
  }
  return outputs;
}

/** Average the graph's outputs over a UV grid (used to bake the material's
 * per-band coefficients). */
export function bakeGraphBands(
  graph: NodeGraph,
  context: Omit<SampleContext, "u" | "v">,
  samplesPerAxis = 8
): { absorption: number; scattering: number; transmission: number } {
  let absorption = 0;
  let scattering = 0;
  let transmission = 0;
  const total = samplesPerAxis * samplesPerAxis;
  for (let i = 0; i < samplesPerAxis; i++) {
    for (let j = 0; j < samplesPerAxis; j++) {
      const u = (i + 0.5) / samplesPerAxis;
      const v = (j + 0.5) / samplesPerAxis;
      const outputs = evaluateGraph(graph, { ...context, u, v });
      for (const out of Object.values(outputs)) {
        absorption += out.absorption / total;
        scattering += out.scattering / total;
        transmission += out.transmission / total;
      }
    }
  }
  const sum = absorption + scattering + transmission;
  if (sum > 1) {
    absorption /= sum;
    scattering /= sum;
    transmission /= sum;
  }
  return { absorption, scattering, transmission };
}
