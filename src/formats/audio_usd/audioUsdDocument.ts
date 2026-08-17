/** Audio-USD document model and its mapping to the engine scene model. */
import type { AudioScene } from "../../core/audio_scene";
import { AUDIO_USD_SCHEMA_VERSION, type AudioUsdPrim, type AudioUsdLayer } from "./schema";

export interface AudioUsdDocument {
  schemaVersion: string;
  upAxis: "y" | "z";
  unitsPerMeter: number;
  /** Ordered layers; later layers override earlier ones (USD-style). */
  layers: AudioUsdLayer[];
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

/** Convert an Audio-USD document into the engine's AudioScene model.
 * TODO: implement prim → typed object mapping per the v0 schema table;
 * TODO: layer composition (references, overrides, variants). */
export function toAudioScene(_document: AudioUsdDocument): AudioScene {
  throw new Error("Not implemented: Audio-USD → AudioScene mapping (Phase 1)");
}
