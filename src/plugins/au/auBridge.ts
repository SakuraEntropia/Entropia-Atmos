/** Audio Unit (AU) host bridge contract.
 *
 * TODO:
 *   - Bind to AudioUnit/CoreAudio APIs (macOS); mirror the VST3 bridge
 *     surface so both hosts share one renderer backend (Phase 5).
 *   - Report kAudioUnitProperty_Latency; expose parameters via an
 *     AUParameterTree for automation.
 */
import type { AudioUsdDocument } from "../../formats/audio_usd";
import type { AudioBlock } from "../../core/dsp";

export interface AuBridge {
  loadScene(document: AudioUsdDocument): Promise<void>;
  setParameter(parameterId: string, normalizedValue: number): void;
  processBlock(input: AudioBlock): AudioBlock;
  reset(): void;
}
