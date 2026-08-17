/** AudioScene: the engine-facing scene container (pure data + validation). */
import type { AcousticEnvironment } from "./environment";
import type { AcousticMaterial } from "./material";
import type { SoundEmitter } from "./emitter";
import type { SoundListener } from "./listener";
import type { SplatField } from "./splatField";
import type { Transform, Vec3 } from "./types";

/** A geometry asset reference consumed by the engine's geometry processor. */
export interface GeometryRef {
  /** Resolves against the scene's asset table (mesh). */
  assetId: string;
  /** Optional acoustic material applied to the surface. */
  materialId?: string;
  transform: Transform;
}

/** Optional rectangular room box that enables shoebox solvers (image source). */
export interface RoomBox {
  min: Vec3;
  max: Vec3;
  /** Optional acoustic material applied to all six walls. */
  wallMaterialId?: string;
}

export interface AudioScene {
  name: string;
  /** "y" or "z"; the engine converts to its internal convention. */
  upAxis: "y" | "z";
  /** World units per meter (e.g. 1, or 100 for centimeter-based scenes). */
  unitsPerMeter: number;
  emitters: SoundEmitter[];
  listeners: SoundListener[];
  materials: AcousticMaterial[];
  environments: AcousticEnvironment[];
  geometry: GeometryRef[];
  /** Optional shoebox room descriptor for image-source style solvers. */
  room?: RoomBox;
  /** Optional AudioGS splat fields (alternative scene representation). */
  splatFields?: SplatField[];
}

export interface SceneValidationIssue {
  path: string;
  message: string;
}

/** Structural validation only (uniqueness, referential integrity, unit
 * sanity). Physics validity is the solver's concern. */
export function validateScene(scene: AudioScene): SceneValidationIssue[] {
  const issues: SceneValidationIssue[] = [];
  const seenIds = new Map<string, string>();

  const claimId = (id: string, kind: string): void => {
    const owner = seenIds.get(id);
    if (owner !== undefined) {
      issues.push({
        path: `${kind}.${id}`,
        message: `duplicate id '${id}' (already used by ${owner})`,
      });
    } else {
      seenIds.set(id, kind);
    }
  };

  for (const emitter of scene.emitters) claimId(emitter.id, "emitter");
  for (const listener of scene.listeners) claimId(listener.id, "listener");
  for (const material of scene.materials) claimId(material.id, "material");
  for (const environment of scene.environments) claimId(environment.id, "environment");

  const materialIds = new Set(scene.materials.map((m) => m.id));
  scene.geometry.forEach((ref, index) => {
    if (ref.materialId !== undefined && !materialIds.has(ref.materialId)) {
      issues.push({
        path: `geometry[${index}].materialId`,
        message: `unknown material '${ref.materialId}'`,
      });
    }
  });

  if (scene.unitsPerMeter <= 0) {
    issues.push({ path: "unitsPerMeter", message: "unitsPerMeter must be > 0" });
  }
  if (scene.upAxis !== "y" && scene.upAxis !== "z") {
    issues.push({ path: "upAxis", message: `upAxis must be 'y' or 'z', got '${scene.upAxis}'` });
  }
  scene.splatFields?.forEach((field, fieldIndex) => {
    if (field.primitives.length === 0) {
      issues.push({ path: `splatFields[${fieldIndex}]`, message: "splat field has no primitives" });
      return;
    }
    const expected = field.primitives[0].shCoefficients.length;
    field.primitives.forEach((splat, splatIndex) => {
      if (splat.shCoefficients.length !== expected) {
        issues.push({
          path: `splatFields[${fieldIndex}].primitives[${splatIndex}]`,
          message: "splat SH coefficient length differs from the field's first splat",
        });
      }
      if (!Number.isFinite(splat.opacity) || splat.opacity < 0) {
        issues.push({
          path: `splatFields[${fieldIndex}].primitives[${splatIndex}].opacity`,
          message: "opacity must be a finite number ≥ 0",
        });
      }
    });
  });

  return issues;
}
