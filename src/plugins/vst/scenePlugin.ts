/** Scene plugin — reference implementation of the VstBridge contract
 * (Phase 5), built on the Phase 3 real-time renderer.
 *
 * A native VST3/AU wrapper embeds this logic (see vst/native/ and
 * au/native/ build specs); this class is the platform-independent core the
 * native shells call into. Parameter surface (automation):
 *   master_gain (0..1 → linear 0..2), listener azimuth override TODO.
 */
import type { AudioBlock } from "../../core/dsp";
import { RealtimeBinauralRenderer, buildSceneIr } from "../../core/dsp/realtime/index";
import { createAudioBlock } from "../../core/dsp";
import type { AudioUsdDocument } from "../../formats/audio_usd";
import { toAudioScene } from "../../formats/audio_usd";
import type { AudioScene } from "../../core/audio_scene";
import {
  DefaultAcousticEngine,
  FdnReverbSystem,
  ImageSourceSolver,
} from "../../core/acoustic_engine";
import { SphericalHeadHrtf } from "../../core/renderer";
import type { VstBridge } from "./vstBridge";

const BLOCK_SIZE = 512;

export class ScenePlugin implements VstBridge {
  private renderer: RealtimeBinauralRenderer | null = null;
  private gain = 1;
  private suspended = false;
  private sampleRate = 48000;
  /** Last rendered scene name (for host status reporting). */
  sceneName = "";

  async loadScene(document: AudioUsdDocument): Promise<void> {
    const scene = toAudioScene(document);
    this.sceneName = scene.name;
    const ir = await this.bakeSceneIr(scene);
    this.renderer = new RealtimeBinauralRenderer(BLOCK_SIZE, ir.left, ir.right);
  }

  private async bakeSceneIr(scene: AudioScene): Promise<{ left: Float32Array; right: Float32Array }> {
    const hrtf = new SphericalHeadHrtf(this.sampleRate);
    const engine = new DefaultAcousticEngine({
      reverb: new FdnReverbSystem(),
      solvers: [new ImageSourceSolver()],
    });
    const dir = await engine.simulate({
      scene,
      emitterId: scene.emitters[0].id,
      listenerId: scene.listeners[0].id,
      options: {
        solver: "image-source",
        maxReflectionOrder: 3,
        sampleRate: this.sampleRate,
        lateFieldDurationSeconds: 0.8,
      },
    });
    return buildSceneIr(dir, hrtf);
  }

  setParameter(parameterId: string, normalizedValue: number): void {
    if (parameterId === "master_gain") {
      this.gain = Math.max(0, Math.min(2, normalizedValue * 2));
    }
    // Unknown parameters are ignored, like a lenient host mapping.
  }

  processBlock(input: AudioBlock): AudioBlock {
    if (!this.renderer || this.suspended) {
      return createAudioBlock(input.channels.length, input.length, input.sampleRate);
    }
    const scaled = input.channels[0].map((v) => v * this.gain);
    const out = this.renderer.processBlock(scaled);
    return { channels: [out.left, out.right], sampleRate: input.sampleRate, length: input.length };
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }
}
