/** Shared Phase 1 test fixture: a 5 × 4 × 3 m concrete shoebox scene. */
import type { AudioScene } from "../core/audio_scene";
import { parseAudioUsd, toAudioScene } from "../formats/audio_usd";

export const SHOEBOX_JSON = `{
  "schemaVersion": "0.1.0",
  "name": "shoebox",
  "upAxis": "y",
  "unitsPerMeter": 1,
  "room": { "min": [0, 0, 0], "max": [5, 4, 3], "wallMaterialId": "concrete" },
  "layers": [
    {
      "name": "main",
      "prims": [
        {
          "type": "emitter",
          "id": "e1",
          "name": "Speaker",
          "payload": {
            "transform": {
              "position": [1, 1, 1.5],
              "rotation": [0, 0, 0, 1],
              "scale": [1, 1, 1]
            },
            "kind": "point"
          }
        },
        {
          "type": "listener",
          "id": "l1",
          "name": "Head",
          "payload": {
            "transform": {
              "position": [3, 3, 1.5],
              "rotation": [0, 0, 0, 1],
              "scale": [1, 1, 1]
            }
          }
        },
        {
          "type": "material",
          "id": "concrete",
          "name": "Concrete",
          "payload": {
            "bands": [
              { "centerHz": 1000, "lowHz": 710, "highHz": 1420, "absorption": 0.08, "scattering": 0.05, "transmission": 0 }
            ]
          }
        },
        {
          "type": "environment",
          "id": "air",
          "name": "Indoor air",
          "payload": {
            "temperatureCelsius": 20,
            "humidityPercent": 50,
            "airAbsorptionModel": "iso-9613-1"
          }
        }
      ]
    }
  ]
}`;

export function buildShoeboxScene(): AudioScene {
  return toAudioScene(parseAudioUsd(SHOEBOX_JSON));
}
