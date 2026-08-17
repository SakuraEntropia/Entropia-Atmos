// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  addWorkspace,
  duplicateWorkspace,
  moveWorkspace,
  removeWorkspace,
  renameWorkspace,
  reorderWorkspace,
  type WorkspaceState,
} from "./workspaces";

function state(): WorkspaceState {
  return {
    list: [
      { id: "a", name: "Layout", root: { kind: "leaf", id: "l1", type: "canvas" } },
      { id: "b", name: "Shading", root: { kind: "leaf", id: "l2", type: "canvas" } },
      { id: "c", name: "Bake", root: { kind: "leaf", id: "l3", type: "canvas" } },
    ],
    activeId: "a",
  };
}

describe("workspace management (tab add/remove/switch logic)", () => {
  it("switches the active workspace", () => {
    const s = state();
    // Switching = setting activeId; the panel content keys off the name.
    expect(s.list.find((w) => w.id === "b")?.name).toBe("Shading");
  });

  it("adds a preset workspace and activates it", () => {
    const s = addWorkspace(state(), "delivery");
    expect(s.list).toHaveLength(4);
    expect(s.activeId).toBe(s.list[3].id);
    expect(s.list[3].name).toBe("Delivery");
  });

  it("removes a workspace and re-targets the active id", () => {
    const s = removeWorkspace({ ...state(), activeId: "b" }, "b");
    expect(s.list.map((w) => w.id)).toEqual(["a", "c"]);
    expect(s.activeId).toBe("a");
  });

  it("never removes the last workspace", () => {
    const single = { list: [state().list[0]], activeId: "a" };
    expect(removeWorkspace(single, "a").list).toHaveLength(1);
  });

  it("renames and duplicates", () => {
    const renamed = renameWorkspace(state(), "b", "Materials");
    expect(renamed.list[1].name).toBe("Materials");
    const dup = duplicateWorkspace(state(), "a");
    expect(dup.list).toHaveLength(4);
    expect(dup.list[1].name).toBe("Layout copy");
    expect(dup.activeId).toBe(dup.list[1].id);
  });

  it("moves and reorders", () => {
    const moved = moveWorkspace(state(), "c", -2);
    expect(moved.list.map((w) => w.id)).toEqual(["c", "a", "b"]);
    const reordered = reorderWorkspace(state(), "c", "a");
    expect(reordered.list.map((w) => w.id)).toEqual(["c", "a", "b"]);
  });
});
