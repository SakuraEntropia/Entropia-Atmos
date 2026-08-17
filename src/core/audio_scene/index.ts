/** Core audio scene model — pure data + validation.
 *
 * This module is the engine's scene contract. It imports nothing from the
 * other engine modules and knows nothing about files (see formats/audio_usd
 * for serialization).
 */
export type {
  Vec3,
  Quat,
  Transform,
  Meters,
  Seconds,
  Hertz,
  Decibels,
  UnitInterval,
} from "./types";
export type { SoundEmitter, EmitterKind, DirectivityBand, EmitterSignal } from "./emitter";
export type { SoundListener } from "./listener";
export type { AcousticMaterial, AcousticBand } from "./material";
export type { AcousticEnvironment, ReverbDefaults } from "./environment";
export type { AudioScene, GeometryRef, RoomBox, SceneValidationIssue } from "./audioScene";
export { validateScene } from "./audioScene";
export type { SplatPrimitive, SplatField } from "./splatField";
