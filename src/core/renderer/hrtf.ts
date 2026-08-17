/** HRTF dataset abstraction for binaural rendering. */
import type { Hertz } from "../audio_scene";

/** A pair of head-related impulse responses for one direction. */
export interface HrirPair {
  left: Float32Array;
  right: Float32Array;
}

export interface HrtfDataset {
  readonly id: string;
  readonly sampleRate: Hertz;
  /** Grid shape when the dataset is a regular azimuth/elevation grid. */
  readonly grid?: { elevations: number; azimuths: number };

  /** Look up the HRIR pair for a direction (radians). Returns undefined when
   * the direction is outside the covered sphere. */
  query(azimuthRadians: number, elevationRadians: number): HrirPair | undefined;
}

// TODO: SOFA file loader; SH-compressed HRTF storage; per-user personalization;
// TODO: smooth interpolation across direction changes (Phase 3).
