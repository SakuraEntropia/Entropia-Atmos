/** DSP layer — block processing and compile-time graphs.
 *
 * Self-contained: imports only scene unit types. The renderer builds graphs
 * here; nothing in this module knows about scenes, HRTFs, or solvers.
 */
export type { AudioBlock } from "./audioBlock";
export { createAudioBlock, isCompatible } from "./audioBlock";
export type { DspContext, DspNode } from "./dspNode";
export type { DspEdge, DspPlan } from "./dspGraph";
export { DspGraph } from "./dspGraph";
