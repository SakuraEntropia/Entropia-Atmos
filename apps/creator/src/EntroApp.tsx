/** ENTRO ATMOS creator shell (Phase 4).
 *
 * Adopts the Entropia template as the Application Layer — unchanged shell
 * primitives (Titlebar, WorkspaceTabs, PanelSlot, areas tree, StatusPanel,
 * ToastStack), extended with the five ENTRO workspaces:
 * Bake · Layout · Shading · Simulation · Delivery.
 *
 * The template's "inspector" panel is repurposed (via the template's own
 * registerPanelContent hook) as the ENTRO context panel for the active
 * workspace. All engine calls go through the /api proxy to server.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Titlebar,
  WorkspaceTabs,
  PanelSlot,
  VSplitter,
  HSplitter,
  ToastStack,
  leaf,
  split,
  registerPanelContent,
  useGraphStore,
  type AreaNode,
  type WorkspaceInstance,
} from "entropia-template-ui";
import { EntroInspector, setActiveWorkspace } from "./panels/EntroInspector";

const ENTRO_WORKSPACES = [
  { id: "bake", label: "Bake", description: "AudioGS training and preprocessing." },
  { id: "layout", label: "Layout", description: "Audio-USD scene construction." },
  { id: "shading", label: "Shading", description: "Acoustic material definition." },
  { id: "simulation", label: "Simulation", description: "Physical acoustic solving." },
  { id: "delivery", label: "Delivery", description: "Plugin ecosystem." },
];

function entroLayout(): AreaNode {
  const left = split("column", leaf("nodes"), leaf("inspector"), 0.7);
  const main = split("row", left, leaf("canvas"), 0.26);
  const bottom = split("row", leaf("status"), leaf("docs"), 0.6);
  return split("column", main, bottom, 0.82);
}

let wsUid = 0;
const newWsId = () => `entro_ws_${++wsUid}`;

export function EntroApp() {
  const loadNodeDefs = useGraphStore((s) => s.loadNodeDefs);
  const [workspaces, setWorkspaces] = useState<WorkspaceInstance[]>(() =>
    ENTRO_WORKSPACES.map((preset) => ({
      id: newWsId(),
      name: preset.label,
      root: entroLayout(),
    }))
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef("layout");

  useEffect(() => {
    // The template loads its node registry from the backend.
    loadNodeDefs().catch(() => undefined);
  }, [loadNodeDefs]);

  useEffect(() => {
    const active = workspaces.find((w) => w.id === (activeId ?? workspaces[0]?.id));
    if (active) {
      activeRef.current = active.name.toLowerCase();
      setActiveWorkspace(activeRef.current);
    }
  }, [activeId, workspaces]);

  const effectiveId = activeId ?? workspaces[0]?.id ?? "";
  const active = workspaces.find((w) => w.id === effectiveId) ?? workspaces[0];
  const root = useMemo(() => active.root, [active]);

  const updateActiveRoot = (fn: (r: AreaNode) => AreaNode) => {
    setWorkspaces((ws) => ws.map((w) => (w.id === effectiveId ? { ...w, root: fn(w.root) } : w)));
  };

  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar />
      <WorkspaceTabs
        workspaces={workspaces}
        activeId={effectiveId}
        onSwitch={setActiveId}
        onAdd={() => undefined}
        onRemove={() => undefined}
        onRename={() => undefined}
        onDuplicate={() => undefined}
        onMove={() => undefined}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <LayoutTree
          node={root}
          onSplitRow={(id) => updateActiveRoot((r) => splitAt(r, id, "row"))}
          onSplitColumn={(id) => updateActiveRoot((r) => splitAt(r, id, "column"))}
          onMerge={(id) => updateActiveRoot((r) => mergeAt(r, id))}
          onClose={(id) => updateActiveRoot((r) => closeAt(r, id))}
        />
      </div>
      <ToastStack />
    </div>
  );
}

function LayoutTree({
  node,
  onSplitRow,
  onSplitColumn,
  onMerge,
  onClose,
}: {
  node: AreaNode;
  onSplitRow: (id: string) => void;
  onSplitColumn: (id: string) => void;
  onMerge: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const render = (n: AreaNode): React.ReactNode => {
    if (n.kind === "leaf") {
      return (
        <PanelSlot
          id={n.id}
          type={n.type}
          onType={() => undefined}
          onSplitRow={() => onSplitRow(n.id)}
          onSplitColumn={() => onSplitColumn(n.id)}
          onMerge={() => onMerge(n.id)}
          onClose={() => onClose(n.id)}
          canMerge
          mergeTarget={false}
          preview={null}
          onPreview={() => undefined}
        />
      );
    }
    const ratio = ratios[n.id] ?? n.ratio;
    const setRatio = (value: number) => setRatios((r) => ({ ...r, [n.id]: Math.min(0.92, Math.max(0.08, value)) }));
    const first = <div style={{ flex: ratio, minWidth: 0, minHeight: 0, overflow: "hidden" }}>{render(n.first)}</div>;
    const second = <div style={{ flex: 1 - ratio, minWidth: 0, minHeight: 0, overflow: "hidden" }}>{render(n.second)}</div>;
    return n.direction === "row" ? (
      <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%" }}>
        {first}
        <VSplitter onDrag={(dx, total) => setRatio(ratio + dx / total)} />
        {second}
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        {first}
        <HSplitter onDrag={(dy, total) => setRatio(ratio + dy / total)} />
        {second}
      </div>
    );
  };
  return <div style={{ width: "100%", height: "100%" }}>{render(node)}</div>;
}

// --- area-tree helpers (mirror the template's areas semantics) ----------------

function splitAt(node: AreaNode, id: string, direction: "row" | "column"): AreaNode {
  if (node.kind === "leaf") {
    return node.id === id ? split(direction, leaf(node.type), leaf(node.type), 0.5) : node;
  }
  return { ...node, first: splitAt(node.first, id, direction), second: splitAt(node.second, id, direction) };
}

function mergeAt(node: AreaNode, id: string): AreaNode {
  if (node.kind === "split") {
    if (node.first.id === id) return node.second;
    if (node.second.id === id) return node.first;
    return { ...node, first: mergeAt(node.first, id), second: mergeAt(node.second, id) };
  }
  return node;
}

function closeAt(node: AreaNode, id: string): AreaNode {
  return mergeAt(node, id);
}

// Register the ENTRO context panel in the template's content registry.
registerPanelContent("inspector", () => <EntroInspector />);
