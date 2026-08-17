/** Spherical-harmonics math core (Data Layer): basis, projection,
 * compression, and error metrics. Self-contained — imports nothing. */
export {
  shBandSize,
  shEvaluateBasis,
  shEvaluate,
  shLeastSquaresFit,
  shWeightedLeastSquaresFit,
  shTruncate,
  shEnergyErrorDb,
  fibonacciDirections,
  doaToSpherical,
  solveDenseLinearSystem,
} from "./sh";
export type { DirectionSample, WeightedDirectionSample } from "./sh";
