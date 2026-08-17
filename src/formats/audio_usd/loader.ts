/** JSON-first Audio-USD reader. */
import { AUDIO_USD_SCHEMA_VERSION, type AudioUsdPrim, type AudioUsdPrimType } from "./schema";
import type { AudioUsdDocument } from "./audioUsdDocument";

const PRIM_TYPES = new Set<string>(["emitter", "listener", "material", "environment", "geometry"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse a JSON string into an AudioUsdDocument, validating document-level
 * structure. Prim payload fields are validated by the v0 schema table
 * (TODO: per-prim-type payload validation). */
export function parseAudioUsd(json: string): AudioUsdDocument {
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw)) throw new Error("Audio-USD root must be a JSON object");
  if (typeof raw.schemaVersion !== "string") {
    throw new Error("missing string field 'schemaVersion'");
  }
  // Version negotiation: same major version required for now.
  if (raw.schemaVersion.split(".")[0] !== AUDIO_USD_SCHEMA_VERSION.split(".")[0]) {
    throw new Error(
      `unsupported Audio-USD schema '${raw.schemaVersion}' (current: ${AUDIO_USD_SCHEMA_VERSION})`
    );
  }
  if (raw.upAxis !== "y" && raw.upAxis !== "z") throw new Error("upAxis must be 'y' or 'z'");
  if (typeof raw.unitsPerMeter !== "number" || raw.unitsPerMeter <= 0) {
    throw new Error("unitsPerMeter must be a number > 0");
  }
  if (!Array.isArray(raw.layers)) throw new Error("missing array field 'layers'");

  const layers = raw.layers.map((layer, layerIndex) => {
    if (!isRecord(layer)) throw new Error(`layers[${layerIndex}] must be an object`);
    if (typeof layer.name !== "string") throw new Error(`layers[${layerIndex}].name must be a string`);
    if (!Array.isArray(layer.prims)) throw new Error(`layers[${layerIndex}].prims must be an array`);

    const prims = layer.prims.map((prim, primIndex): AudioUsdPrim => {
      if (!isRecord(prim)) throw new Error(`layers[${layerIndex}].prims[${primIndex}] must be an object`);
      if (typeof prim.type !== "string" || !PRIM_TYPES.has(prim.type)) {
        throw new Error(`layers[${layerIndex}].prims[${primIndex}].type is invalid`);
      }
      if (typeof prim.id !== "string" || typeof prim.name !== "string") {
        throw new Error(`layers[${layerIndex}].prims[${primIndex}] must have string id and name`);
      }
      if (!isRecord(prim.payload)) {
        throw new Error(`layers[${layerIndex}].prims[${primIndex}].payload must be an object`);
      }
      return {
        type: prim.type as AudioUsdPrimType,
        id: prim.id,
        name: prim.name,
        payload: prim.payload,
      };
    });
    return { name: layer.name, prims };
  });

  return {
    schemaVersion: raw.schemaVersion,
    upAxis: raw.upAxis,
    unitsPerMeter: raw.unitsPerMeter,
    layers,
  };
}
