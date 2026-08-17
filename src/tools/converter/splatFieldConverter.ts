/** Splat-field ↔ Audio-USD converter.
 *
 * Converts an AudioGS splat field into an Audio-USD document carrying a
 * "splatField" prim — usable as a reference or an override layer for a
 * scene. The reverse direction (Audio-USD → splat field) is the format
 * module's toAudioScene mapping, so the pair forms the round-trip.
 */
import type { SplatField } from "../../core/audio_scene";
import { createDocument, type AudioUsdDocument } from "../../formats/audio_usd";
import { serializeSplatField, splatFieldBandCount } from "../dataset";
import type { SceneConverter } from "./converters";

export class SplatFieldConverter implements SceneConverter<SplatField> {
  readonly from = "splat-field";
  readonly to = "audio-usd";

  async convert(field: SplatField): Promise<AudioUsdDocument> {
    const serialized = serializeSplatField(field, splatFieldBandCount(field));
    const document = createDocument("y", 1);
    document.name = "audio-gs-field";
    document.layers.push({
      name: "splat-field",
      prims: [
        {
          type: "splatField",
          id: "field",
          name: "AudioGS splat field",
          payload: {
            splats: serialized.splats.map((splat) => ({
              position: splat.position,
              scale: splat.scale,
              rotation: splat.rotation,
              opacity: splat.opacity,
              shCoefficients: splat.shCoefficients,
            })),
          },
        },
      ],
    });
    return document;
  }
}
