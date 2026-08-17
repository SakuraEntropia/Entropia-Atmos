/** Splat-field scene data (AudioGS primitives) — pure data, no behavior.
 *
 * A splat field reconstructs a sound field as localized Gaussian primitives
 * carrying SH-compressed directional spectral content. Scene-level types
 * live here so both the dataset tooling and the Audio-USD format can share
 * them without the scene core depending on either.
 */
import type { Quat, Vec3 } from "./types";

/** One AudioGS primitive: a Gaussian with directional (SH) content. */
export interface SplatPrimitive {
  position: Vec3;
  /** Gaussian scale (standard deviation) per axis, meters. */
  scale: Vec3;
  rotation: Quat;
  /** Normalized directional pattern: SH coefficients whose integral over the
   * sphere is 1 (isotropic pattern = [1/√(4π), 0, …]). */
  shCoefficients: Float32Array;
  /** Total field energy carried by the splat ("opacity proxy", SPEC FR-16). */
  opacity: number;
}

export interface SplatField {
  primitives: SplatPrimitive[];
}
