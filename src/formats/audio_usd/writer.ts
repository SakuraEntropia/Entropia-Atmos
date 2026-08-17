/** JSON-first Audio-USD writer. */
import type { AudioUsdDocument } from "./audioUsdDocument";

/** Serialize a document to canonical JSON (2-space indent, trailing newline). */
export function serializeAudioUsd(document: AudioUsdDocument): string {
  return JSON.stringify(document, null, 2) + "\n";
}
