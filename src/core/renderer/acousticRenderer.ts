/** Top-level renderer: baked scene → binaural output.
 *
 * TODO:
 *   Implement GPU-accelerated acoustic rendering orchestration (Phase 3):
 *   cache DIRs per emitter/listener pair, stream source audio, and drive the
 *   DSP graph in real time.
 */
import type { AudioScene } from "../audio_scene";
import type { DirectionalImpulseResponse } from "../acoustic_engine";
import type { AudioBlock } from "../dsp";
import type { BinauralRenderer } from "./binauralRenderer";
import type { HrtfDataset } from "./hrtf";

/** A scene with all directional IRs precomputed ("baked"). */
export interface BakedScene {
  sceneName: string;
  /** DIR per (emitter, listener) pair, keyed "emitterId:listenerId". */
  dirs: Map<string, DirectionalImpulseResponse>;
}

export interface RenderRequest {
  baked: BakedScene;
  listenerId: string;
  /** Source audio per emitter id. */
  sources: Map<string, AudioBlock>;
}

export interface AcousticRenderer {
  readonly binaural: BinauralRenderer;

  /** Bake DIRs for every emitter/listener pair (offline or background job). */
  bake(scene: AudioScene, hrtf: HrtfDataset): Promise<BakedScene>;

  /** Render all emitters for one listener into a stereo block. */
  render(request: RenderRequest, hrtf: HrtfDataset, sampleRate: number): Promise<AudioBlock>;
}
