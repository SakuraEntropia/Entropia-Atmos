/** Acoustic-BRDF: directional reflection response of an acoustic material.
 *
 * The acoustic analogue of a BRDF: given a material band, an incident
 * direction, and an outgoing direction, evaluate the fraction of energy
 * re-radiated. Scattering blurs the specular lobe; absorption removes energy;
 * transmission passes it through.
 */
import type { AcousticBand, AcousticMaterial, Vec3 } from "../audio_scene";

export interface AcousticBrdfSample {
  /** Reflected energy fraction (linear, 0..1). */
  reflected: number;
  /** Transmitted energy fraction (linear, 0..1). */
  transmitted: number;
}

export interface AcousticBRDF {
  /** Evaluate reflection/transmission for one band at one surface hit. */
  evaluate(
    material: AcousticMaterial,
    band: AcousticBand,
    incidentDirection: Vec3,
    outgoingDirection: Vec3,
    surfaceNormal: Vec3
  ): AcousticBrdfSample;
}

// TODO: Implement specular + Lambert lobes weighted by band scattering and
// TODO: absorption; fit coefficients from measured material data; extend the
// TODO: model with a diffraction-aware term (Phase 1-2).
