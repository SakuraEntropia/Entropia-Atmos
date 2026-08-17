/** Minimal Wavefront OBJ reader (positions + faces; n-gons triangulated
 * fan-wise). Sufficient for acoustic geometry in tests and examples.
 * Not supported: normals/UVs/materials (ignored with a warning-free skip).
 */

export interface TriangleMesh {
  positions: Float32Array;
  triangles: Uint32Array;
}

export function parseObj(text: string): TriangleMesh {
  const positions: number[] = [];
  const triangles: number[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v") {
      positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    } else if (parts[0] === "f") {
      const indices = parts.slice(1).map((token) => {
        const index = Number(token.split("/")[0]); // "v/vt/vn" → v
        if (!Number.isInteger(index) || index === 0) {
          throw new Error(`invalid OBJ face index '${token}'`);
        }
        return index > 0 ? index - 1 : positions.length / 3 + index; // negative = relative
      });
      if (indices.length < 3) throw new Error("OBJ faces need ≥ 3 vertices");
      for (let i = 1; i < indices.length - 1; i++) {
        triangles.push(indices[0], indices[i], indices[i + 1]);
      }
    }
    // All other statements (vt, vn, mtllib, o, g, s, …) are skipped.
  }
  if (positions.length === 0 || triangles.length === 0) {
    throw new Error("OBJ file contains no positions or faces");
  }
  return { positions: Float32Array.from(positions), triangles: Uint32Array.from(triangles) };
}
