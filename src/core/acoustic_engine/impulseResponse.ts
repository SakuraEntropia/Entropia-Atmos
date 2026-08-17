/** Directional impulse response — the canonical engine → renderer contract.
 *
 * Everything the engine produces is a DIR; everything the renderer consumes
 * is a DIR. This indirection is what lets solvers and renderers evolve
 * independently (ARCHITECTURE.md §3.3).
 */
import type { Hertz, Meters, Seconds } from "../audio_scene";

/** One early-reflection path arriving at the listener. */
export interface DirectionalPath {
  /** Arrival direction at the listener, radians (scene azimuth/elevation). */
  azimuthRadians: number;
  elevationRadians: number;
  /** Total path length (direct + reflections), meters. */
  distanceMeters: Meters;
  /** Material ids hit along the path, in hit order. */
  materialHits: string[];
  /** Mono impulse response samples for this path. */
  samples: Float32Array;
}

/** A statistical late-field descriptor for one frequency band. */
export interface LateBand {
  centerHz: Hertz;
  /** Reverberation time T60 in seconds. */
  t60Seconds: Seconds;
  /** Late-field energy relative to direct sound, in dB. */
  gainDb: number;
}

export interface LateField {
  bands: LateBand[];
  /** Synthesized late-tail IR (mono; decorrelated per ear at render time). */
  samples: Float32Array;
  /** Optional decorrelated per-ear late-tail IRs, synthesized by the engine. */
  stereo?: { left: Float32Array; right: Float32Array };
}

export interface DirectionalImpulseResponse {
  sampleRate: Hertz;
  durationSeconds: Seconds;
  early: DirectionalPath[];
  late: LateField;
}
