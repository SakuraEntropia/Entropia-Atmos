/** AudioGS dataset pipeline contracts (Phase 2).
 *
 * Stages: ingestion → voxelization → training → compression → streaming.
 * All stages are interfaces today; implementations arrive in Phase 2, with a
 * PyTorch adapter living dataset-side (see ARCHITECTURE.md §7).
 */
import type { Hertz, Quat, Vec3 } from "../../core/audio_scene";

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

/** A voxelized sound-field volume (the training representation). */
export interface VoxelField {
  /** Voxel grid resolution per axis. */
  resolution: [number, number, number];
  voxelSizeMeters: number;
  /** Per-voxel spectrogram/SH payload; layout frozen in Phase 2. */
  data: Float32Array;
}

/** One AudioGS primitive: a Gaussian with directional spectral content. */
export interface SplatPrimitive {
  position: Vec3;
  /** Scale (standard deviation) per axis, meters. */
  scale: Vec3;
  rotation: Quat;
  /** Spherical-harmonics coefficients; band count varies per LOD level. */
  shCoefficients: Float32Array;
  opacity: number;
}

export interface SplatField {
  primitives: SplatPrimitive[];
}

/** One compressed level of detail of a splat field. */
export interface SplatLevel {
  level: number;
  shBands: number;
  primitives: SplatPrimitive[];
}

export interface Voxelizer {
  /** Bin captured signals into a voxel field.
   * TODO: density + feature estimation per voxel. */
  voxelize(source: DatasetSource, voxelSizeMeters: number): Promise<VoxelField>;
}

export interface AudioGsTrainer {
  /** Train Gaussian primitives to reconstruct a voxel field.
   * TODO: gradient-based densification/pruning (PyTorch adapter). */
  train(field: VoxelField, epochs: number): Promise<SplatField>;
}

export interface SplatCompressor {
  /** Compress a field into LOD levels under a storage budget (bytes).
   * TODO: SH band truncation + quantization; per-level error metrics. */
  compress(field: SplatField, storageBudgetBytes: number): Promise<SplatLevel[]>;
}

export interface SplatStreamer {
  /** Stream LODs toward a moving listener.
   * TODO: LOD switching, prefetch, back-pressure (Phase 3). */
  stream(levels: SplatLevel[], listenerPosition: Vec3): AsyncIterable<SplatLevel>;
}
