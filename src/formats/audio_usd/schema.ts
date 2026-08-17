/** Audio-USD schema: versioned prim definitions.
 *
 * Audio-USD is a layered scene description in the spirit of Pixar's USD,
 * specialized for acoustics. v0 is JSON-first and intentionally minimal;
 * binary USD compatibility is an adapter (Phase 2), not a rewrite.
 */

/** Bump when prim shapes change incompatibly; migrations are documented per
 * bump and MUST ship with the change (SPEC M-04).
 *
 * 0.2.0: ADDITIVE — new "splatField" prim (AudioGS). v0.1 documents remain
 * readable; no fields were removed or renamed. */
export const AUDIO_USD_SCHEMA_VERSION = "0.2.0";

export type AudioUsdPrimType =
  | "emitter"
  | "listener"
  | "material"
  | "environment"
  | "geometry"
  | "splatField";

export interface AudioUsdPrim {
  type: AudioUsdPrimType;
  id: string;
  name: string;
  /** Type-specific fields, validated by the v0 schema table (see loader). */
  payload: Record<string, unknown>;
}

export interface AudioUsdLayer {
  name: string;
  prims: AudioUsdPrim[];
}
