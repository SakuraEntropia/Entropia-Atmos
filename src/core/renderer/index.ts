/** Rendering layer — Acoustic-BRDF, HRTF, binaural rendering.
 *
 * Consumes directional impulse responses (engine) and source audio (DSP) and
 * produces stereo output blocks. Never simulates propagation.
 */
export type { HrirPair, HrtfDataset } from "./hrtf";
export type { AcousticBrdfSample, AcousticBRDF } from "./acousticBrdf";
export type { BinauralRenderRequest, BinauralRenderer } from "./binauralRenderer";
export type { BakedScene, RenderRequest, AcousticRenderer } from "./acousticRenderer";
