/** Core math and physical-unit types shared by the audio scene model.
 *
 * The scene core is pure data: these types carry no behavior beyond what the
 * engine and renderer read. Units follow SI: meters, seconds, radians, hertz.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/** Named unit aliases — documentation-first types; all are plain numbers. */
export type Meters = number;
export type Seconds = number;
export type Hertz = number;
export type Decibels = number;

/** A normalized scalar in [0, 1]. */
export type UnitInterval = number;
