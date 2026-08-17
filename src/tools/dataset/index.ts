/** Dataset tooling for the AudioGS pipeline (Phase 2).
 *
 * Implemented: simulated-field synthesis, SH voxelization, splat projection,
 * band-truncation LODs with measured error, JSON serialization + manifest.
 * TODO(Phase 2 research): microphone ingestion, differentiable trainer.
 */
export type { DatasetSource, VoxelField, SplatLevel } from "./pipeline";
export type { SplatField, SplatPrimitive } from "../../core/audio_scene";
export type { AudioGsTrainer, SplatCompressor, SplatStreamer } from "./pipeline";
export type { DirectionalSample, FieldGrid } from "./fieldSynthesis";
export {
  sampleFieldWithImageSource,
  voxelizeDirectionalField,
  projectFieldToSplats,
  compressSplatField,
  splatFieldErrorDb,
  buildSplatManifest,
  serializeSplatField,
  parseSplatField,
  splatFieldBandCount,
  SPLAT_FIELD_SCHEMA_VERSION,
} from "./fieldSynthesis";
export type { SerializedSplatField, SplatManifest, SplatManifestLevel } from "./fieldSynthesis";
