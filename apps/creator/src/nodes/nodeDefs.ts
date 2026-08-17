/** Acoustic material node system — Blender-style node definitions.
 *
 * Sockets carry typed values: scalar (S), vector (V), image (I), video (Vd),
 * and texture coordinates (TC). The graph's output nodes (Absorption,
 * Scattering, Transmission) drive the material's per-band Acoustic-BRDF
 * coefficients when baked.
 */

export type SocketKind = "S" | "V" | "I" | "VD" | "TC";

export interface SocketDef {
  name: string;
  kind: SocketKind;
  direction: "in" | "out";
}

export interface ParamDef {
  name: string;
  kind: "float" | "int" | "seed";
  default: number;
  min?: number;
  max?: number;
}

export interface NodeDef {
  type: string;
  label: string;
  category: string;
  inputs: SocketDef[];
  outputs: SocketDef[];
  params: ParamDef[];
}

export const NODE_DEFS: NodeDef[] = [
  // --- Inputs ---------------------------------------------------------------
  {
    type: "textureCoordinate",
    label: "Texture Coordinate",
    category: "Input",
    inputs: [],
    outputs: [
      { name: "uv", kind: "TC", direction: "out" },
      { name: "world", kind: "V", direction: "out" },
      { name: "band", kind: "S", direction: "out" },
    ],
    params: [],
  },
  {
    type: "time",
    label: "Time",
    category: "Input",
    inputs: [],
    outputs: [{ name: "seconds", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "value",
    label: "Value",
    category: "Input",
    inputs: [],
    outputs: [{ name: "value", kind: "S", direction: "out" }],
    params: [{ name: "value", kind: "float", default: 0.5, min: 0, max: 1 }],
  },
  // --- Procedural textures ---------------------------------------------------
  {
    type: "perlinNoise",
    label: "Perlin Noise",
    category: "Texture",
    inputs: [
      { name: "vector", kind: "V", direction: "in" },
      { name: "scale", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "value", kind: "S", direction: "out" }],
    params: [
      { name: "scale", kind: "float", default: 4, min: 0.1, max: 64 },
      { name: "octaves", kind: "int", default: 4, min: 1, max: 8 },
      { name: "seed", kind: "seed", default: 0 },
    ],
  },
  {
    type: "checker",
    label: "Checker",
    category: "Texture",
    inputs: [{ name: "vector", kind: "V", direction: "in" }],
    outputs: [{ name: "value", kind: "S", direction: "out" }],
    params: [{ name: "scale", kind: "float", default: 4, min: 0.1, max: 64 }],
  },
  {
    type: "imageTexture",
    label: "Image Texture",
    category: "Texture",
    inputs: [{ name: "uv", kind: "TC", direction: "in" }],
    outputs: [{ name: "value", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "videoTexture",
    label: "Video Texture",
    category: "Texture",
    inputs: [{ name: "uv", kind: "TC", direction: "in" }],
    outputs: [{ name: "value", kind: "S", direction: "out" }],
    params: [],
  },
  // --- Math ------------------------------------------------------------------
  {
    type: "mathAdd",
    label: "Add",
    category: "Math",
    inputs: [
      { name: "a", kind: "S", direction: "in" },
      { name: "b", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathSubtract",
    label: "Subtract",
    category: "Math",
    inputs: [
      { name: "a", kind: "S", direction: "in" },
      { name: "b", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathMultiply",
    label: "Multiply",
    category: "Math",
    inputs: [
      { name: "a", kind: "S", direction: "in" },
      { name: "b", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathDivide",
    label: "Divide",
    category: "Math",
    inputs: [
      { name: "a", kind: "S", direction: "in" },
      { name: "b", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathPower",
    label: "Power",
    category: "Math",
    inputs: [
      { name: "base", kind: "S", direction: "in" },
      { name: "exponent", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathSine",
    label: "Sine",
    category: "Math",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  {
    type: "mathClamp",
    label: "Clamp",
    category: "Math",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [
      { name: "min", kind: "float", default: 0, min: 0, max: 1 },
      { name: "max", kind: "float", default: 1, min: 0, max: 1 },
    ],
  },
  {
    type: "mathMapRange",
    label: "Map Range",
    category: "Math",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [
      { name: "fromMin", kind: "float", default: 0 },
      { name: "fromMax", kind: "float", default: 1 },
      { name: "toMin", kind: "float", default: 0 },
      { name: "toMax", kind: "float", default: 1 },
    ],
  },
  {
    type: "mathMix",
    label: "Mix",
    category: "Math",
    inputs: [
      { name: "a", kind: "S", direction: "in" },
      { name: "b", kind: "S", direction: "in" },
      { name: "factor", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "S", direction: "out" }],
    params: [],
  },
  // --- Vector -----------------------------------------------------------------
  {
    type: "vectorMath",
    label: "Vector Math",
    category: "Vector",
    inputs: [
      { name: "a", kind: "V", direction: "in" },
      { name: "b", kind: "V", direction: "in" },
    ],
    outputs: [{ name: "result", kind: "V", direction: "out" }, { name: "scalar", kind: "S", direction: "out" }],
    params: [{ name: "operation", kind: "int", default: 0, min: 0, max: 5 }], // add/sub/mul/dot/cross/normalize
  },
  {
    type: "combineXyz",
    label: "Combine XYZ",
    category: "Vector",
    inputs: [
      { name: "x", kind: "S", direction: "in" },
      { name: "y", kind: "S", direction: "in" },
      { name: "z", kind: "S", direction: "in" },
    ],
    outputs: [{ name: "vector", kind: "V", direction: "out" }],
    params: [],
  },
  {
    type: "separateXyz",
    label: "Separate XYZ",
    category: "Vector",
    inputs: [{ name: "vector", kind: "V", direction: "in" }],
    outputs: [
      { name: "x", kind: "S", direction: "out" },
      { name: "y", kind: "S", direction: "out" },
      { name: "z", kind: "S", direction: "out" },
    ],
    params: [],
  },
  // --- Output ------------------------------------------------------------------
  {
    type: "absorptionOutput",
    label: "Absorption",
    category: "Output",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [],
    params: [],
  },
  {
    type: "scatteringOutput",
    label: "Scattering",
    category: "Output",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [],
    params: [],
  },
  {
    type: "transmissionOutput",
    label: "Transmission",
    category: "Output",
    inputs: [{ name: "value", kind: "S", direction: "in" }],
    outputs: [],
    params: [],
  },
];

export const NODE_CATEGORIES = ["Input", "Texture", "Math", "Vector", "Output"];

export function getNodeDef(type: string): NodeDef | undefined {
  return NODE_DEFS.find((n) => n.type === type);
}
