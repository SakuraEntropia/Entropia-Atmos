/** Listener prim: the "camera" of the acoustic pipeline. */
import type { Meters, Transform } from "./types";

export interface SoundListener {
  id: string;
  name: string;
  /** Head transform. Scene convention: +z forward, +y up, units = meters. */
  transform: Transform;
  /** HRTF dataset reference (asset id); required for binaural output. */
  hrtfRef?: string;
  /** Interaural spacing in meters, used when no HRTF set is assigned. */
  earSpacing?: Meters;
}
