/** Environment prim: the propagation medium and its defaults. */
import type { Hertz, Meters, Seconds } from "./types";

export interface ReverbDefaults {
  /** Target reverberation time (T60) per band, in seconds. */
  t60ByBand?: { centerHz: Hertz; t60Seconds: Seconds }[];
  /** Broadband room gain in dB when no geometry is present. */
  roomGainDb?: number;
}

export interface AcousticEnvironment {
  id: string;
  name: string;
  temperatureCelsius: number;
  humidityPercent: number;
  /** Speed of sound [m/s]; derived from temperature/humidity when omitted. */
  speedOfSound?: Meters;
  /** Air-absorption model: ISO 9613-1 or none (free field). */
  airAbsorptionModel?: "iso-9613-1" | "none";
  /** Late-reverberation defaults for scenes without explicit geometry. */
  reverbDefaults?: ReverbDefaults;
}
