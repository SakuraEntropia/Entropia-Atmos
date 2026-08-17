/** AudioGS dataset pipeline contracts (Phase 2).
 *
 * Implemented in this phase: simulated-field ingestion (image-source),
 * SH voxelization, splat projection, and SH band-truncation LODs — see
 * fieldSynthesis.ts. Remaining contracts:
 * TODO(Phase 2 research): microphone-array ingestion (STFT → directional
 * features) and the differentiable PyTorch trainer (see training/README.md).
 */
import type { Hertz, Vec3 } from "../../core/audio_scene";
import type { SplatField, SplatPrimitive } from "../../core/audio_scene";

export type { SplatField, SplatPrimitive } from "../../core/audio_scene";

/** A spatial audio recording session (microphone array or simulated field). */
export interface DatasetSource {
  id: string;
  /** Sample rate of captured signals. */
  sampleRate: Hertz;
  /** Microphone positions in world space. */
  microphonePositions: Vec3[];
  /** Per-microphone signal assets; index-aligned with microphonePositions. */
  signalAssets: string[];
}

/** A voxelized directional sound field: per-voxel SH coefficients.
 * `bands` = 1 (broadband energy) or 4 (per-analysis-band energy, 0004). */
export interface VoxelField {
  /** Voxel grid resolution per axis. */
  resolution: [number, number, number];
  /** Voxel edge length, meters. */
  voxelSizeMeters: number;
  /** World-space position of the grid's minimum corner. */
  origin: Vec3;
  /** Spherical-harmonics band count per voxel. */
  bandCount: number;
  /** Analysis-band count (1 or 4). */
  bands: number;
  /** Per-voxel SH coefficients, voxels × bands × bandCount², x-fastest. */
  coefficients: Float32Array;
}

/** One compressed level of detail of a splat field. */
export interface SplatLevel {
  level: number;
  shBands: number;
  primitives: SplatPrimitive[];
}

export interface AudioGsTrainer {
  /** Train Gaussian primitives to reconstruct a voxel field.
   * TODO(Phase 2 research): gradient-based densification/pruning behind the
   * dataset-side PyTorch adapter — see training/README.md. */
  train(field: VoxelField, epochs: number): Promise<SplatField>;
}

export interface SplatCompressor {
  /** Compress a field into LOD levels under a storage budget (bytes). */
  compress(field: SplatField, storageBudgetBytes: number): Promise<SplatLevel[]>;
}

export interface SplatStreamer {
  /** Stream LODs toward a moving listener.
   * TODO(Phase 3): LOD switching, prefetch, back-pressure. */
  stream(levels: SplatLevel[], listenerPosition: Vec3): AsyncIterable<SplatLevel>;
}
