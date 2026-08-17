/** Real spherical harmonics: basis evaluation, least-squares projection,
 * band truncation, and directional-energy error metrics.
 *
 * Conventions (fixed for the whole codebase):
 * - orthonormal real basis, associated Legendre polynomials WITHOUT the
 *   Condon–Shortley phase;
 * - band index i = l(l+1) + m for m ∈ [−l, l]; a bandCount-b representation
 *   has bandCount² coefficients ordered by ascending l;
 * - spherical coordinates: theta = polar angle (0 = +z), phi = azimuth.
 */

export function shBandSize(bandCount: number): number {
  return bandCount * bandCount;
}

/** Factorials up to 2·bandCount, cached per call. */
function factorials(upTo: number): Float64Array {
  const f = new Float64Array(upTo + 1);
  f[0] = 1;
  for (let i = 1; i <= upTo; i++) f[i] = f[i - 1] * i;
  return f;
}

/** Evaluate all real SH basis functions up to `bandCount` at (theta, phi). */
export function shEvaluateBasis(theta: number, phi: number, bandCount: number): Float64Array {
  const size = bandCount * bandCount;
  const out = new Float64Array(size);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const fact = factorials(2 * Math.max(1, bandCount - 1));

  // Associated Legendre polynomials (no CS phase), one array per l.
  const p: number[][] = [[1]];
  for (let l = 1; l < bandCount; l++) {
    const row = new Array<number>(l + 1);
    row[l] = (2 * l - 1) * sinTheta * p[l - 1][l - 1];
    for (let m = 0; m < l; m++) {
      const lower = m <= l - 2 ? p[l - 2][m] : 0;
      row[m] = ((2 * l - 1) * cosTheta * p[l - 1][m] - (l + m - 1) * lower) / (l - m);
    }
    p.push(row);
  }

  for (let l = 0; l < bandCount; l++) {
    const base = l * (l + 1);
    const norm = Math.sqrt((2 * l + 1) / (4 * Math.PI));
    out[base] = norm * p[l][0];
    for (let m = 1; m <= l; m++) {
      const n = norm * Math.sqrt((2 * fact[l - m]) / fact[l + m]);
      const radial = p[l][m];
      out[base + m] = n * radial * Math.cos(m * phi);
      out[base - m] = n * radial * Math.sin(m * phi);
    }
  }
  return out;
}

/** Reconstruct the field value of an SH representation at (theta, phi). */
export function shEvaluate(coefficients: Float32Array | Float64Array, theta: number, phi: number): number {
  const bandCount = Math.round(Math.sqrt(coefficients.length));
  if (bandCount * bandCount !== coefficients.length) {
    throw new Error("SH coefficient count must be a perfect square");
  }
  const basis = shEvaluateBasis(theta, phi, bandCount);
  let sum = 0;
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] * basis[i];
  return sum;
}

export interface DirectionSample {
  theta: number;
  phi: number;
  value: number;
}

export interface WeightedDirectionSample extends DirectionSample {
  weight: number;
}

/** Least-squares (ridge-regularized) projection of scattered directional
 * samples onto the SH basis. */
export function shLeastSquaresFit(samples: DirectionSample[], bandCount: number, ridge = 1e-6): Float64Array {
  return shWeightedLeastSquaresFit(
    samples.map((sample) => ({ ...sample, weight: 1 })),
    bandCount,
    ridge
  );
}

/** Weighted least-squares: minimizes Σ wᵢ (Aᵢc − vᵢ)² + ridge·‖c‖². */
export function shWeightedLeastSquaresFit(samples: WeightedDirectionSample[], bandCount: number, ridge = 1e-6): Float64Array {
  const size = bandCount * bandCount;
  const ata = new Float64Array(size * size);
  const atb = new Float64Array(size);
  for (const sample of samples) {
    const basis = shEvaluateBasis(sample.theta, sample.phi, bandCount);
    for (let i = 0; i < size; i++) {
      atb[i] += sample.weight * basis[i] * sample.value;
      for (let j = 0; j < size; j++) {
        ata[i * size + j] += sample.weight * basis[i] * basis[j];
      }
    }
  }
  for (let i = 0; i < size; i++) ata[i * size + i] += ridge;
  return solveDenseLinearSystem(ata, atb);
}

/** Gaussian elimination with partial pivoting (small dense systems).
 * Exported for reuse by downstream least-squares tooling. */
export function solveDenseLinearSystem(a: Float64Array, b: Float64Array): Float64Array {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row * n + col]) > Math.abs(a[pivot * n + col])) pivot = row;
    }
    if (Math.abs(a[pivot * n + col]) < 1e-14) {
      throw new Error("singular SH least-squares system (increase ridge or add samples)");
    }
    if (pivot !== col) {
      for (let k = 0; k < n; k++) {
        const t = a[col * n + k];
        a[col * n + k] = a[pivot * n + k];
        a[pivot * n + k] = t;
      }
      const t = b[col];
      b[col] = b[pivot];
      b[pivot] = t;
    }
    for (let row = col + 1; row < n; row++) {
      const factor = a[row * n + col] / a[col * n + col];
      for (let k = col; k < n; k++) a[row * n + k] -= factor * a[col * n + k];
      b[row] -= factor * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= a[row * n + k] * x[k];
    x[row] = sum / a[row * n + row];
  }
  return x;
}

/** Truncate an SH representation to fewer bands (keeps the lowest l). */
export function shTruncate(coefficients: Float32Array | Float64Array, targetBandCount: number): Float32Array {
  const sourceBands = Math.round(Math.sqrt(coefficients.length));
  if (targetBandCount > sourceBands) throw new Error("cannot truncate to more bands than the source");
  return Float32Array.from(coefficients.subarray(0, targetBandCount * targetBandCount));
}

/** Approximately uniform directions on the sphere (Fibonacci lattice). */
export function fibonacciDirections(count: number): DirectionSample[] {
  const out: DirectionSample[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count > 1 ? 1 - (2 * i) / (count - 1) : 0;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out.push({ theta: Math.acos(y), phi: golden * i, value: 0 });
  }
  return out;
}

/** Directional-energy reconstruction error of a truncated representation
 * relative to the full one, in dB: 10·log10(Σ(t−f)² / Σ f²). */
export function shEnergyErrorDb(full: Float32Array | Float64Array, truncated: Float32Array | Float64Array, directions: DirectionSample[]): number {
  let fullEnergy = 0;
  let diffEnergy = 0;
  for (const direction of directions) {
    const f = shEvaluate(full, direction.theta, direction.phi);
    const t = shEvaluate(truncated, direction.theta, direction.phi);
    fullEnergy += f * f;
    diffEnergy += (f - t) * (f - t);
  }
  if (fullEnergy === 0) return 0;
  if (diffEnergy === 0) return -120; // numerically perfect reconstruction (serializable)
  return 10 * Math.log10(diffEnergy / fullEnergy);
}

/** Convert a direction of arrival in scene convention (azimuth: 0 = +z
 * forward, +90° = +x right; elevation: 0 = horizon, +90° = +y up) to SH
 * spherical coordinates (theta from +z, phi from +x). */
export function doaToSpherical(azimuthRadians: number, elevationRadians: number): DirectionSample {
  const x = Math.sin(azimuthRadians) * Math.cos(elevationRadians);
  const y = Math.sin(elevationRadians);
  const z = Math.cos(azimuthRadians) * Math.cos(elevationRadians);
  return {
    theta: Math.acos(Math.max(-1, Math.min(1, z))),
    phi: Math.atan2(y, x),
    value: 0,
  };
}
