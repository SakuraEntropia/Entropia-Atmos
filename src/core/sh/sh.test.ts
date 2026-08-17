import { describe, expect, it } from "vitest";
import {
  fibonacciDirections,
  shEnergyErrorDb,
  shEvaluate,
  shEvaluateBasis,
  shLeastSquaresFit,
  shTruncate,
} from "./sh";

const POLE = { theta: 0, phi: 0 };

describe("SH basis evaluation", () => {
  it("matches known closed-form values", () => {
    expect(shEvaluateBasis(0.3, 0.7, 1)[0]).toBeCloseTo(1 / Math.sqrt(4 * Math.PI), 6); // Y00
    const band1 = shEvaluateBasis(POLE.theta, POLE.phi, 2);
    expect(band1[2]).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)), 6); // Y_1^0 at pole
    expect(band1[1]).toBeCloseTo(0, 6);
    expect(band1[3]).toBeCloseTo(0, 6);

    const band3 = shEvaluateBasis(Math.PI / 2, 0, 3);
    expect(band3[8]).toBeCloseTo(Math.sqrt(15 / (16 * Math.PI)), 6); // Y_2^2 at θ=π/2, φ=0
  });

  it("is orthonormal under spherical integration", () => {
    const bandCount = 3;
    const directions = fibonacciDirections(4000);
    const basis = directions.map((d) => shEvaluateBasis(d.theta, d.phi, bandCount));
    const size = bandCount * bandCount;
    for (let i = 0; i < size; i++) {
      for (let j = i; j < size; j++) {
        let dot = 0;
        for (let k = 0; k < basis.length; k++) dot += basis[k][i] * basis[k][j];
        dot *= (4 * Math.PI) / basis.length;
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 1);
      }
    }
  });
});

describe("SH least-squares projection", () => {
  it("recovers the coefficients of a known mixture", () => {
    const bandCount = 3;
    // f = 0.7·Y00 + 0.5·Y_1^0 + 0.3·Y_2^2
    const truth = new Float64Array(bandCount * bandCount);
    truth[0] = 0.7; // l=0
    truth[2] = 0.5; // l=1, m=0
    truth[8] = 0.3; // l=2, m=2
    const directions = fibonacciDirections(2000);
    const samples = directions.map((d) => ({
      ...d,
      value: shEvaluate(truth, d.theta, d.phi),
    }));
    const fit = shLeastSquaresFit(samples, bandCount);
    for (let i = 0; i < truth.length; i++) {
      expect(fit[i]).toBeCloseTo(truth[i], 2);
    }
  });

  it("fits a constant directional pattern", () => {
    const samples = fibonacciDirections(500).map((d) => ({ ...d, value: 1 }));
    const fit = shLeastSquaresFit(samples, 2);
    expect(fit[0]).toBeCloseTo(Math.sqrt(4 * Math.PI), 1); // 1 = c0·Y00 → c0 = √(4π)
    expect(fit[1]).toBeCloseTo(0, 1);
    expect(fit[2]).toBeCloseTo(0, 1);
    expect(fit[3]).toBeCloseTo(0, 1);
  });
});

describe("SH compression & error metric", () => {
  it("truncation error decreases monotonically with band count", () => {
    const bandCount = 4;
    const truth = new Float64Array(bandCount * bandCount);
    for (let i = 0; i < truth.length; i++) truth[i] = 1 / (1 + i);
    const directions = fibonacciDirections(1000);

    const errors: number[] = [];
    for (let bands = 1; bands <= bandCount; bands++) {
      errors.push(shEnergyErrorDb(truth, shTruncate(truth, bands), directions));
    }
    expect(errors[0]).toBeGreaterThan(errors[1]);
    expect(errors[1]).toBeGreaterThan(errors[2]);
    expect(errors[2]).toBeGreaterThan(errors[3]);
    expect(errors[3]).toBeLessThan(-100); // full band ≈ perfect (float32 rounding)
  });
});
