/** Sound emitter prim: a source of sound energy inside an AudioScene. */
import type { Decibels, Hertz, Seconds, Transform, UnitInterval } from "./types";

export type EmitterKind = "point" | "area" | "ambient";

/** Per-frequency-band directivity gain (linear, 1 = omnidirectional). */
export interface DirectivityBand {
  centerHz: Hertz;
  /** Gain (linear) along the emitter's forward axis at this band. */
  gain: UnitInterval;
}

/** A reference to the signal asset an emitter plays. */
export interface EmitterSignal {
  /** Asset or node-graph id resolving in the scene's asset table. */
  ref: string;
  /** Output level in dB, applied before directivity. */
  level: Decibels;
  /** Playback region in seconds; omitted = whole asset. */
  range?: { start: Seconds; end: Seconds };
}

export interface SoundEmitter {
  id: string;
  name: string;
  transform: Transform;
  kind: EmitterKind;
  /** Optional reference geometry for area sources (asset id). */
  geometryRef?: string;
  /** Optional per-band directivity; omitted = omnidirectional. */
  directivity?: DirectivityBand[];
  /** Optional attached signal; emitters may be silent (analysis only). */
  signal?: EmitterSignal;
}
