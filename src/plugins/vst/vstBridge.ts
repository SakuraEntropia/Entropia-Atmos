/** VST3 host bridge contract.
 *
 * TODO:
 *   - Bind to the VST3 SDK through a native module (Rust/C++); keep this TS
 *     contract as the plugin-facing surface (Phase 5).
 *   - Map automation-addressable parameters (listener pose, emitter gains,
 *     dry/wet mix) to engine render requests.
 *   - Report latency to the host; suspend/resume processing.
 */
import type { AudioUsdDocument } from "../../formats/audio_usd";
import type { AudioBlock } from "../../core/dsp";

export interface VstBridge {
  /** Load a baked scene document into the plugin instance. */
  loadScene(document: AudioUsdDocument): Promise<void>;

  /** Set an automation parameter (normalized 0..1 host value). */
  setParameter(parameterId: string, normalizedValue: number): void;

  /** Process one audio block through the spatial renderer. */
  processBlock(input: AudioBlock): AudioBlock;

  suspend(): void;
  resume(): void;
}
