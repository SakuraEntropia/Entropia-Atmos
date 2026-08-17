/** Acoustic material prim: the parameter surface evaluated by an Acoustic-BRDF. */
import type { Hertz, UnitInterval } from "./types";

/** One frequency band of an acoustic material. Coefficients are linear in
 * [0, 1]; a valid band satisfies absorption + scattering + transmission <= 1. */
export interface AcousticBand {
  centerHz: Hertz;
  lowHz: Hertz;
  highHz: Hertz;
  /** Fraction of incident energy absorbed by the surface. */
  absorption: UnitInterval;
  /** Fraction scattered away from the specular direction. */
  scattering: UnitInterval;
  /** Fraction transmitted through the surface. */
  transmission: UnitInterval;
}

export interface AcousticMaterial {
  id: string;
  name: string;
  /** Ordered octave/third-octave bands; rendering interpolates bandwise. */
  bands: AcousticBand[];
}
