/** Audio-USD format module — scene description serialization.
 *
 * Depends on core/audio_scene types only (see src/README.md dependency rules).
 * Audio-USD is the canonical scene format; converters target it.
 */
export { AUDIO_USD_SCHEMA_VERSION } from "./schema";
export type { AudioUsdPrim, AudioUsdPrimType, AudioUsdLayer } from "./schema";
export type { AudioUsdDocument, AudioUsdRoom } from "./audioUsdDocument";
export { createDocument, flattenPrims, toAudioScene } from "./audioUsdDocument";
export { parseAudioUsd } from "./loader";
export { serializeAudioUsd } from "./writer";
