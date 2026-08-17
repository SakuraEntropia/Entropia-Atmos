/** Audio-USD document model and its mapping to the engine scene model. */
import type {
  AcousticBand,
  AcousticEnvironment,
  AcousticMaterial,
  AudioScene,
  GeometryRef,
  Quat,
  RoomBox,
  SoundEmitter,
  SoundListener,
  SplatField,
  SplatPrimitive,
  Transform,
  Vec3,
} from "../../core/audio_scene";
import { AUDIO_USD_SCHEMA_VERSION, type AudioUsdLayer, type AudioUsdPrim } from "./schema";

/** Optional shoebox room descriptor (document-level, not a prim). */
export interface AudioUsdRoom {
  min: [number, number, number];
  max: [number, number, number];
  wallMaterialId?: string;
}

export interface AudioUsdDocument {
  schemaVersion: string;
  /** Human-readable scene name (optional). */
  name?: string;
  upAxis: "y" | "z";
  unitsPerMeter: number;
  /** Ordered layers; later layers override earlier ones (USD-style). */
  layers: AudioUsdLayer[];
  /** Optional rectangular room for image-source style solvers. */
  room?: AudioUsdRoom;
}

/** Create an empty document at the current schema version. */
export function createDocument(upAxis: "y" | "z" = "y", unitsPerMeter = 1): AudioUsdDocument {
  return { schemaVersion: AUDIO_USD_SCHEMA_VERSION, upAxis, unitsPerMeter, layers: [] };
}

/** Flatten layered prims into a single list (last write wins per id). */
export function flattenPrims(document: AudioUsdDocument): AudioUsdPrim[] {
  const byId = new Map<string, AudioUsdPrim>();
  for (const layer of document.layers) {
    for (const prim of layer.prims) byId.set(prim.id, prim);
  }
  return [...byId.values()];
}

// --- typed payload validation & mapping -------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`Audio-USD → AudioScene: ${path}: ${message}`);
}

function field(payload: Record<string, unknown>, key: string, path: string): unknown {
  return payload[key];
}

function numberField(payload: Record<string, unknown>, key: string, path: string): number {
  const value = field(payload, key, path);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path}.${key}`, "must be a finite number");
  }
  return value;
}

function optionalNumberField(payload: Record<string, unknown>, key: string, path: string): number | undefined {
  return payload[key] === undefined ? undefined : numberField(payload, key, path);
}

function stringField(payload: Record<string, unknown>, key: string, path: string): string {
  const value = field(payload, key, path);
  if (typeof value !== "string") fail(`${path}.${key}`, "must be a string");
  return value;
}

function optionalStringField(payload: Record<string, unknown>, key: string, path: string): string | undefined {
  return payload[key] === undefined ? undefined : stringField(payload, key, path);
}

function vec3Field(payload: Record<string, unknown>, key: string, path: string): Vec3 {
  const value = field(payload, key, path);
  if (!Array.isArray(value) || value.length !== 3 || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    fail(`${path}.${key}`, "must be [x, y, z] numbers");
  }
  return { x: value[0] as number, y: value[1] as number, z: value[2] as number };
}

function quatField(payload: Record<string, unknown>, key: string, path: string): Quat {
  const value = field(payload, key, path);
  if (!Array.isArray(value) || value.length !== 4 || value.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    fail(`${path}.${key}`, "must be [x, y, z, w] numbers");
  }
  return { x: value[0] as number, y: value[1] as number, z: value[2] as number, w: value[3] as number };
}

function transformField(payload: Record<string, unknown>, path: string): Transform {
  const value = field(payload, "transform", path);
  if (!isRecord(value)) fail(`${path}.transform`, "must be an object");
  return {
    position: vec3Field(value, "position", `${path}.transform`),
    rotation: quatField(value, "rotation", `${path}.transform`),
    scale: value.scale === undefined ? { x: 1, y: 1, z: 1 } : vec3Field(value, "scale", `${path}.transform`),
  };
}

function unitField(payload: Record<string, unknown>, key: string, path: string): number {
  const value = numberField(payload, key, path);
  if (value < 0 || value > 1) fail(`${path}.${key}`, "must be within [0, 1]");
  return value;
}

// --- prim mappers -----------------------------------------------------------

function mapEmitter(prim: AudioUsdPrim): SoundEmitter {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  const kind = optionalStringField(payload, "kind", path) ?? "point";
  if (kind !== "point" && kind !== "area" && kind !== "ambient") {
    fail(`${path}.kind`, "must be 'point' | 'area' | 'ambient'");
  }
  const emitter: SoundEmitter = {
    id: prim.id,
    name: prim.name,
    transform: transformField(payload, path),
    kind,
  };
  const geometryRef = optionalStringField(payload, "geometryRef", path);
  if (geometryRef !== undefined) emitter.geometryRef = geometryRef;
  if (payload.directivity !== undefined) {
    if (!Array.isArray(payload.directivity)) fail(`${path}.directivity`, "must be an array");
    emitter.directivity = payload.directivity.map((band, i) => {
      if (!isRecord(band)) fail(`${path}.directivity[${i}]`, "must be an object");
      return { centerHz: numberField(band, "centerHz", `${path}.directivity[${i}]`), gain: unitField(band, "gain", `${path}.directivity[${i}]`) };
    });
  }
  if (payload.signal !== undefined) {
    if (!isRecord(payload.signal)) fail(`${path}.signal`, "must be an object");
    const signal: SoundEmitter["signal"] = {
      ref: stringField(payload.signal, "ref", `${path}.signal`),
      level: numberField(payload.signal, "level", `${path}.signal`),
    };
    if (payload.signal.range !== undefined) {
      if (!isRecord(payload.signal.range)) fail(`${path}.signal.range`, "must be an object");
      signal.range = {
        start: numberField(payload.signal.range, "start", `${path}.signal.range`),
        end: numberField(payload.signal.range, "end", `${path}.signal.range`),
      };
    }
    emitter.signal = signal;
  }
  return emitter;
}

function mapListener(prim: AudioUsdPrim): SoundListener {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  const listener: SoundListener = {
    id: prim.id,
    name: prim.name,
    transform: transformField(payload, path),
  };
  const hrtfRef = optionalStringField(payload, "hrtfRef", path);
  if (hrtfRef !== undefined) listener.hrtfRef = hrtfRef;
  const earSpacing = optionalNumberField(payload, "earSpacing", path);
  if (earSpacing !== undefined) listener.earSpacing = earSpacing;
  return listener;
}

function mapMaterial(prim: AudioUsdPrim): AcousticMaterial {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  if (!Array.isArray(payload.bands)) fail(`${path}.bands`, "must be an array");
  const bands: AcousticBand[] = payload.bands.map((band, i) => {
    if (!isRecord(band)) fail(`${path}.bands[${i}]`, "must be an object");
    const absorption = unitField(band, "absorption", `${path}.bands[${i}]`);
    const scattering = unitField(band, "scattering", `${path}.bands[${i}]`);
    const transmission = unitField(band, "transmission", `${path}.bands[${i}]`);
    if (absorption + scattering + transmission > 1 + 1e-6) {
      fail(`${path}.bands[${i}]`, "absorption + scattering + transmission must be ≤ 1");
    }
    return {
      centerHz: numberField(band, "centerHz", `${path}.bands[${i}]`),
      lowHz: numberField(band, "lowHz", `${path}.bands[${i}]`),
      highHz: numberField(band, "highHz", `${path}.bands[${i}]`),
      absorption,
      scattering,
      transmission,
    };
  });
  return { id: prim.id, name: prim.name, bands };
}

function mapEnvironment(prim: AudioUsdPrim): AcousticEnvironment {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  const environment: AcousticEnvironment = {
    id: prim.id,
    name: prim.name,
    temperatureCelsius: numberField(payload, "temperatureCelsius", path),
    humidityPercent: numberField(payload, "humidityPercent", path),
  };
  const speedOfSound = optionalNumberField(payload, "speedOfSound", path);
  if (speedOfSound !== undefined) environment.speedOfSound = speedOfSound;
  const airAbsorptionModel = optionalStringField(payload, "airAbsorptionModel", path);
  if (airAbsorptionModel !== undefined) {
    if (airAbsorptionModel !== "iso-9613-1" && airAbsorptionModel !== "none") {
      fail(`${path}.airAbsorptionModel`, "must be 'iso-9613-1' | 'none'");
    }
    environment.airAbsorptionModel = airAbsorptionModel;
  }
  if (payload.reverbDefaults !== undefined) {
    if (!isRecord(payload.reverbDefaults)) fail(`${path}.reverbDefaults`, "must be an object");
    const defaults: AcousticEnvironment["reverbDefaults"] = {};
    if (payload.reverbDefaults.t60ByBand !== undefined) {
      if (!Array.isArray(payload.reverbDefaults.t60ByBand)) fail(`${path}.reverbDefaults.t60ByBand`, "must be an array");
      defaults.t60ByBand = payload.reverbDefaults.t60ByBand.map((band, i) => {
        if (!isRecord(band)) fail(`${path}.reverbDefaults.t60ByBand[${i}]`, "must be an object");
        return {
          centerHz: numberField(band, "centerHz", `${path}.reverbDefaults.t60ByBand[${i}]`),
          t60Seconds: numberField(band, "t60Seconds", `${path}.reverbDefaults.t60ByBand[${i}]`),
        };
      });
    }
    const roomGainDb = optionalNumberField(payload.reverbDefaults, "roomGainDb", `${path}.reverbDefaults`);
    if (roomGainDb !== undefined) defaults.roomGainDb = roomGainDb;
    environment.reverbDefaults = defaults;
  }
  return environment;
}

function mapGeometry(prim: AudioUsdPrim): GeometryRef {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  const ref: GeometryRef = {
    assetId: stringField(payload, "assetId", path),
    transform: transformField(payload, path),
  };
  const materialId = optionalStringField(payload, "materialId", path);
  if (materialId !== undefined) ref.materialId = materialId;
  return ref;
}

function mapSplatField(prim: AudioUsdPrim): SplatField {
  const path = `prims/${prim.id}`;
  const payload = prim.payload;
  if (!Array.isArray(payload.splats)) fail(`${path}.splats`, "must be an array");
  if (payload.splats.length === 0) fail(`${path}.splats`, "must not be empty");
  const primitives: SplatPrimitive[] = payload.splats.map((raw, i) => {
    if (!isRecord(raw)) fail(`${path}.splats[${i}]`, "must be an object");
    const coefficients = raw.shCoefficients;
    if (!Array.isArray(coefficients) || coefficients.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      fail(`${path}.splats[${i}].shCoefficients`, "must be an array of finite numbers");
    }
    const splat: SplatPrimitive = {
      position: vec3Field(raw, "position", `${path}.splats[${i}]`),
      scale: vec3Field(raw, "scale", `${path}.splats[${i}]`),
      rotation: quatField(raw, "rotation", `${path}.splats[${i}]`),
      opacity: numberField(raw, "opacity", `${path}.splats[${i}]`),
      shCoefficients: Float32Array.from(coefficients as number[]),
    };
    if (raw.bandShCoefficients !== undefined) {
      if (!Array.isArray(raw.bandShCoefficients)) fail(`${path}.splats[${i}].bandShCoefficients`, "must be an array of coefficient arrays");
      splat.bandShCoefficients = raw.bandShCoefficients.map((band: unknown, b) => {
        if (!Array.isArray(band)) fail(`${path}.splats[${i}].bandShCoefficients[${b}]`, "must be an array of numbers");
        return Float32Array.from(band as number[]);
      });
    }
    if (raw.bandEnergies !== undefined) {
      if (!Array.isArray(raw.bandEnergies)) fail(`${path}.splats[${i}].bandEnergies`, "must be an array of numbers");
      splat.bandEnergies = raw.bandEnergies as number[];
    }
    return splat;
  });
  return { primitives };
}

/** Convert an Audio-USD document into the engine's AudioScene model,
 * validating every prim payload against the v0 schema.
 * TODO: layer composition (references, overrides, variants). */
export function toAudioScene(document: AudioUsdDocument): AudioScene {
  const scene: AudioScene = {
    name: document.name ?? "audio-usd-scene",
    upAxis: document.upAxis,
    unitsPerMeter: document.unitsPerMeter,
    emitters: [],
    listeners: [],
    materials: [],
    environments: [],
    geometry: [],
  };
  for (const prim of flattenPrims(document)) {
    switch (prim.type) {
      case "emitter":
        scene.emitters.push(mapEmitter(prim));
        break;
      case "listener":
        scene.listeners.push(mapListener(prim));
        break;
      case "material":
        scene.materials.push(mapMaterial(prim));
        break;
      case "environment":
        scene.environments.push(mapEnvironment(prim));
        break;
      case "geometry":
        scene.geometry.push(mapGeometry(prim));
        break;
      case "splatField":
        scene.splatFields = [...(scene.splatFields ?? []), mapSplatField(prim)];
        break;
      default:
        fail(`prims/${prim.id}`, `unknown prim type '${prim.type}'`);
    }
  }
  if (document.room !== undefined) {
    const room: RoomBox = {
      min: { x: document.room.min[0], y: document.room.min[1], z: document.room.min[2] },
      max: { x: document.room.max[0], y: document.room.max[1], z: document.room.max[2] },
    };
    if (room.min.x >= room.max.x || room.min.y >= room.max.y || room.min.z >= room.max.z) {
      fail("room", "min must be strictly below max on every axis");
    }
    if (document.room.wallMaterialId !== undefined) room.wallMaterialId = document.room.wallMaterialId;
    scene.room = room;
  }
  return scene;
}
