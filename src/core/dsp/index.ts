/** DSP layer — block processing, compile-time graphs, FFT convolution. */
export type { AudioBlock } from "./audioBlock";
export { createAudioBlock, isCompatible } from "./audioBlock";
export type { DspContext, DspNode } from "./dspNode";
export type { DspEdge, DspPlan } from "./dspGraph";
export { DspGraph } from "./dspGraph";
export { fftInPlace, fftConvolve, directConvolve } from "./fft";
export {
  ANALYSIS_BANDS,
  ANALYSIS_BAND_COUNT,
  bandImpulseResponse,
  pathFirFromBandGains,
  splitIntoBands,
} from "./bands";
export type { AnalysisBand } from "./bands";
export type { StereoBlockOut } from "./realtime/blockRenderer";
export { StreamingConvolver, buildSceneIr, RealtimeBinauralRenderer } from "./realtime/index";
export { SourceNode } from "./nodes/sourceNode";
export { GainNode } from "./nodes/gainNode";
export { SumNode } from "./nodes/sumNode";
export { ConvolverNode } from "./nodes/convolverNode";
