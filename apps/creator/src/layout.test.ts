// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  countLeaves,
  leaf,
  mergeLeaf,
  resizeSplit,
  siblingNodeId,
  split,
  splitLeaf,
} from "entropia-template-ui";
import type { AreaNode } from "entropia-template-ui";

describe("panel split/merge primitives (template semantics)", () => {
  it("splitLeaf replaces a leaf with a same-type split", () => {
    const root = leaf("canvas");
    const next = splitLeaf(root, root.id, "row");
    expect(next.kind).toBe("split");
    if (next.kind === "split") {
      expect(next.first.kind).toBe("leaf");
      expect(next.second.kind).toBe("leaf");
      if (next.first.kind === "leaf") expect(next.first.type).toBe("canvas");
      if (next.second.kind === "leaf") expect(next.second.type).toBe("canvas");
      expect(next.ratio).toBe(0.5);
    }
    expect(countLeaves(next)).toBe(2);
  });

  it("mergeLeaf keeps the dragged leaf and removes its sibling", () => {
    const root = split("row", leaf("canvas"), leaf("inspector"), 0.5);
    if (root.kind !== "split") throw new Error("expected split");
    const merged = mergeLeaf(root, root.first.id);
    expect(merged.kind).toBe("leaf");
    if (merged.kind === "leaf") expect(merged.type).toBe("canvas");
  });

  it("siblingNodeId returns the other child of the parent split", () => {
    const root = split("row", leaf("canvas"), leaf("inspector"), 0.5);
    if (root.kind !== "split") throw new Error("expected split");
    expect(siblingNodeId(root, root.first.id)).toBe(root.second.id);
    expect(siblingNodeId(root, root.second.id)).toBe(root.first.id);
  });

  it("resizeSplit clamps the ratio", () => {
    const root = split("row", leaf("canvas"), leaf("inspector"), 0.5);
    const grown = resizeSplit(root, root.id, 10) as AreaNode;
    if (grown.kind === "split") expect(grown.ratio).toBeCloseTo(0.92);
    const shrunk = resizeSplit(root, root.id, -10) as AreaNode;
    if (shrunk.kind === "split") expect(shrunk.ratio).toBeCloseTo(0.08);
  });
});
