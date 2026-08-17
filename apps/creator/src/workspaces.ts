/** ENTRO workspace presets — each workspace gets its own panel layout,
 * like the original template's per-preset area trees. */
import { leaf, split, type AreaNode, type WorkspacePreset } from "entropia-template-ui";

const status = (): AreaNode => leaf("status");

export const ENTRO_PRESETS: WorkspacePreset[] = [
  {
    id: "layout",
    label: "Layout",
    category: "ENTRO",
    description: "Scene construction: scene graph + 3D panner + inspector.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("inspector"), 0.62);
      const main = split("row", left, leaf("canvas"), 0.26);
      return split("column", main, status(), 0.82);
    },
  },
  {
    id: "shading",
    label: "Shading",
    category: "ENTRO",
    description: "Acoustic materials: scene graph + node editor + canvas.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("shader"), 0.55);
      const main = split("row", left, leaf("canvas"), 0.28);
      return split("column", main, status(), 0.82);
    },
  },
  {
    id: "simulation",
    label: "Simulation",
    category: "ENTRO",
    description: "Solver runs: inspector up top, taller log below.",
    build: () => {
      const left = split("column", leaf("inspector"), leaf("nodes"), 0.45);
      const main = split("row", left, leaf("canvas"), 0.24);
      return split("column", main, status(), 0.7);
    },
  },
  {
    id: "bake",
    label: "Bake",
    category: "ENTRO",
    description: "AudioGS: bake panel + node editor + big log for LOD tables.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("shader"), 0.6);
      const main = split("row", left, leaf("canvas"), 0.26);
      return split("column", main, status(), 0.68);
    },
  },
  {
    id: "delivery",
    label: "Delivery",
    category: "ENTRO",
    description: "Export: scene + canvas + transport-heavy bottom bar.",
    build: () => {
      const left = split("column", leaf("nodes"), leaf("inspector"), 0.7);
      const main = split("row", left, leaf("canvas"), 0.24);
      return split("column", main, status(), 0.66);
    },
  },
];
