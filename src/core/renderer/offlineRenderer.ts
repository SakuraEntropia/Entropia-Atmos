/** Offline renderer: bakes DIRs via the engine, then renders through the
 * binaural renderer and sums emitters into one stereo block.
 *
 * TODO:
 *   Implement GPU-accelerated rendering orchestration (Phase 3): DIR
 *   caching, real-time DSP graph scheduling, listener-move interpolation.
 */
import type { AudioScene } from "../audio_scene";
import type { AcousticEngine, DirectionalImpulseResponse, SimulationRequest } from "../acoustic_engine";
import type { AudioBlock } from "../dsp";
import type { BakedScene, RenderRequest, AcousticRenderer } from "./acousticRenderer";
import type { BinauralRenderer } from "./binauralRenderer";
import type { HrtfDataset } from "./hrtf";

const DEFAULT_MAX_REFLECTION_ORDER = 4;

export interface OfflineAcousticRendererOptions {
  engine: AcousticEngine;
  binaural: BinauralRenderer;
  /** Simulation defaults shared by all bakes (solver id etc.). */
  simulation?: Partial<SimulationRequest["options"]>;
}

export class OfflineAcousticRenderer implements AcousticRenderer {
  readonly binaural: BinauralRenderer;

  constructor(private readonly options: OfflineAcousticRendererOptions) {
    this.binaural = options.binaural;
  }

  async bake(scene: AudioScene, hrtf: HrtfDataset): Promise<BakedScene> {
    const dirs = new Map<string, DirectionalImpulseResponse>();
    for (const emitter of scene.emitters) {
      for (const listener of scene.listeners) {
        const request: SimulationRequest = {
          scene,
          emitterId: emitter.id,
          listenerId: listener.id,
          options: {
            solver: "image-source",
            maxReflectionOrder: DEFAULT_MAX_REFLECTION_ORDER,
            sampleRate: hrtf.sampleRate,
            ...this.options.simulation,
          },
        };
        dirs.set(`${emitter.id}:${listener.id}`, await this.options.engine.simulate(request));
      }
    }
    return { sceneName: scene.name, dirs };
  }

  async render(request: RenderRequest, hrtf: HrtfDataset, sampleRate: number): Promise<AudioBlock> {
    const blocks: AudioBlock[] = [];
    for (const [emitterId, source] of request.sources) {
      const dir = request.baked.dirs.get(`${emitterId}:${request.listenerId}`);
      if (!dir) {
        throw new Error(`no baked DIR for emitter '${emitterId}' → listener '${request.listenerId}'`);
      }
      if (dir.sampleRate !== sampleRate) {
        throw new Error(`DIR sample rate ${dir.sampleRate} != render rate ${sampleRate} (resampling TODO)`);
      }
      blocks.push(await this.binaural.render({ dir, source, hrtf, sampleRate }));
    }
    if (blocks.length === 0) throw new Error("render request has no sources");

    let out = blocks[0];
    for (const block of blocks.slice(1)) {
      const length = Math.max(out.length, block.length);
      const channels = out.channels.map((channel, c) => {
        const extended = new Float32Array(length);
        extended.set(channel);
        const other = block.channels[c] ?? new Float32Array(0);
        for (let i = 0; i < other.length; i++) extended[i] += other[i];
        return extended;
      });
      out = { channels, sampleRate, length };
    }
    return out;
  }
}
