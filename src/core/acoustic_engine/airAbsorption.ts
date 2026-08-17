/** Air absorption per ISO 9613-1 (atmospheric attenuation in dB/m).
 *
 * Implements the standard's relaxation-frequency formula for the attenuation
 * coefficient of pure-tone sound in still air, as a function of frequency,
 * temperature, and relative humidity.
 *
 * Reference: ISO 9613-1:1993, "Acoustics — Attenuation of sound during
 * propagation outdoors — Part 1: Calculation of the absorption of sound by
 * the atmosphere".
 */
export function airAbsorptionDbPerMeter(
  frequencyHz: number,
  temperatureCelsius: number,
  humidityPercent: number
): number {
  const T = temperatureCelsius + 273.15;
  const T0 = 293.15;
  const h = humidityPercent;
  const f = frequencyHz;

  const frO = 24 + 4.04e4 * h * ((0.02 + h) / (0.391 + h));
  const frN = Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));

  const attenuation = 8.686 * f * f * (
    1.84e-11 * Math.pow(T / T0, 0.5)
    + Math.pow(T / T0, -2.5) * (
      0.01275 * Math.exp(-2239.1 / T) / (frO + (f * f) / frO)
      + 0.1068 * Math.exp(-3352.0 / T) / (frN + (f * f) / frN)
    )
  );
  return attenuation; // dB/m
}

/** Amplitude attenuation factor over a distance (linear, 1 = no loss). */
export function airAbsorptionFactor(
  distanceMeters: number,
  frequencyHz: number,
  temperatureCelsius: number,
  humidityPercent: number
): number {
  const db = airAbsorptionDbPerMeter(frequencyHz, temperatureCelsius, humidityPercent);
  return Math.pow(10, (-db * distanceMeters) / 20);
}
