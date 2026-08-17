/** Material parameter utilities shared by the engine solvers. */
import type { AcousticMaterial } from "../audio_scene";

/** Default absorption used when a surface has no assigned material. */
export const DEFAULT_ABSORPTION = 0.1;

/** Absorption coefficient at `frequencyHz` for a material: exact band match
 * first, nearest band center otherwise, default when absent. */
export function absorptionAt(material: AcousticMaterial | undefined, frequencyHz: number): number {
  if (!material || material.bands.length === 0) return DEFAULT_ABSORPTION;
  let best = material.bands[0];
  let bestDistance = Math.abs(best.centerHz - frequencyHz);
  for (const band of material.bands) {
    if (frequencyHz >= band.lowHz && frequencyHz <= band.highHz) return band.absorption;
    const distance = Math.abs(band.centerHz - frequencyHz);
    if (distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best.absorption;
}

/** Per-reflection amplitude coefficient for a material band (energy
 * absorption → amplitude domain). */
export function reflectionAmplitude(absorption: number): number {
  return Math.sqrt(Math.max(0, 1 - absorption));
}
