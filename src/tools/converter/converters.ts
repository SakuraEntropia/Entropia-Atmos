/** Scene converter registry (extension point, ARCHITECTURE.md §8). */
import type { AudioUsdDocument } from "../../formats/audio_usd";

export interface ConverterOptions {
  /** Optional target schema version hint. */
  targetSchemaVersion?: string;
}

/** A converter turns an external representation into Audio-USD (and back).
 * Audio-USD is the canonical hub format: converters are point-to-point with
 * Audio-USD on one end. */
export interface SceneConverter<External = unknown> {
  readonly from: string;
  readonly to: string;
  convert(input: External, options?: ConverterOptions): Promise<AudioUsdDocument>;
}

/** In-memory converter registry. */
export class ConverterRegistry {
  private readonly converters = new Map<string, SceneConverter>();

  register(converter: SceneConverter): void {
    const key = `${converter.from}->${converter.to}`;
    if (this.converters.has(key)) throw new Error(`converter '${key}' is already registered`);
    this.converters.set(key, converter);
  }

  resolve(from: string, to: string): SceneConverter | undefined {
    return this.converters.get(`${from}->${to}`);
  }

  list(): readonly SceneConverter[] {
    return [...this.converters.values()];
  }
}

// TODO: concrete converters — SOFA ↔ Audio-USD, glTF/USD geometry → Audio-USD,
// TODO: splat field → Audio-USD reference (Phase 2).
