import { describe, expect, it } from "vitest";
import {
  compressSplatField,
  parseSplatField,
  projectFieldToSplats,
  serializeSplatField,
  splatFieldBandCount,
  splatFieldErrorDb,
  voxelizeDirectionalField,
  type DirectionalSample,
} from "./fieldSynthesis";

const GRID = { resolution: [1, 1, 1] as [number, number, number], voxelSizeMeters: 1, origin: { x: 0, y: 0, z: 0 } };

function deltaSamples(directions: { azimuthRadians: number; elevationRadians: number; gain: number }[]): DirectionalSample[] {
  return directions.map((direction, i) => ({
    position: { x: 0.5 + i * 0.01, y: 0.5, z: 0.5 },
    directions: [direction],
  }));
}

describe("voxelizeDirectionalField", () => {
  it("fits a directional delta to its SH coefficients", () => {
    const samples = deltaSamples([
      { azimuthRadians: 0, elevationRadians: 0, gain: 1 },
      { azimuthRadians: 0, elevationRadians: 0, gain: 1 },
    ]);
    const field = voxelizeDirectionalField(samples, GRID, 2);
    // A single direction under-determines the LS system: the fit is the
    // minimum-norm solution c = A·v/‖A‖² along that one basis row.
    const y00 = 1 / Math.sqrt(4 * Math.PI);
    const y10 = Math.sqrt(3 / (4 * Math.PI));
    const norm2 = y00 * y00 + y10 * y10;
    expect(field.coefficients[0]).toBeCloseTo(y00 / norm2, 2);
    expect(field.coefficients[1]).toBeCloseTo(0, 2);
    expect(field.coefficients[2]).toBeCloseTo(y10 / norm2, 2);
    expect(field.coefficients[3]).toBeCloseTo(0, 2);
  });

  it("leaves voxels without samples empty", () => {
    const samples = deltaSamples([{ azimuthRadians: 0, elevationRadians: 0, gain: 1 }]);
    const field = voxelizeDirectionalField(samples, { resolution: [3, 1, 1], voxelSizeMeters: 1, origin: { x: 0, y: 0, z: 0 } }, 2);
    // Voxel 0 (x ≈ 0.5) holds the fit; voxel 2 (x ≈ 2.5) is beyond the
    // 1.5-voxel influence cutoff.
    expect(field.coefficients[0]).not.toBe(0);
    expect(field.coefficients[8]).toBe(0);
    expect(field.coefficients[9]).toBe(0);
  });
});

describe("projectFieldToSplats", () => {
  it("projects a voxel into a splat with a normalized pattern", () => {
    const samples = deltaSamples([{ azimuthRadians: 0, elevationRadians: 0, gain: 1 }]);
    const field = voxelizeDirectionalField(samples, GRID, 2);
    const splats = projectFieldToSplats(field);
    expect(splats.primitives).toHaveLength(1);
    const splat = splats.primitives[0];
    expect(splat.position).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
    // opacity = isotropic energy = c0·√(4π); coefficients normalized.
    expect(splat.opacity).toBeCloseTo(field.coefficients[0] * Math.sqrt(4 * Math.PI), 4);
    expect(splat.shCoefficients[0]).toBeCloseTo(1 / Math.sqrt(4 * Math.PI), 4);
  });
});

describe("splat field compression", () => {
  function mixedField() {
    const samples = deltaSamples([
      { azimuthRadians: 0, elevationRadians: 0, gain: 1 },
      { azimuthRadians: Math.PI / 2, elevationRadians: 0, gain: 0.7 },
      { azimuthRadians: Math.PI, elevationRadians: 0.3, gain: 0.5 },
      { azimuthRadians: -Math.PI / 2, elevationRadians: -0.2, gain: 0.3 },
    ]);
    return projectFieldToSplats(voxelizeDirectionalField(samples, GRID, 4));
  }

  it("produces LODs with monotonically decreasing error", () => {
    const splats = mixedField();
    const levels = compressSplatField(splats, [1, 2, 3, 4]);
    expect(levels.map((l) => l.shBands)).toEqual([1, 2, 3, 4]);
    const errors = levels.map((level) => splatFieldErrorDb(splats, level));
    expect(errors[0]).toBeGreaterThan(errors[1]);
    expect(errors[1]).toBeGreaterThan(errors[2]);
    expect(errors[3]).toBeLessThan(-100); // full band ≈ perfect (float32 rounding)
  });

  it("round-trips splat field JSON", () => {
    const field = mixedField();
    const parsed = parseSplatField(serializeSplatField(field, splatFieldBandCount(field)));
    expect(parsed.primitives).toHaveLength(field.primitives.length);
    expect(parsed.primitives[0].shCoefficients).toEqual(field.primitives[0].shCoefficients);
    expect(parsed.primitives[0].opacity).toBe(field.primitives[0].opacity);
  });
});
