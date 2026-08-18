/** ENTRO ATMOS menu bar — File / Edit / Render / Window / Help plus the
 * ENTRO workspace tabs, all in ONE bar, mirroring the original template
 * UI (which renders its menus and workspace tabs inside a single
 * `.menubar` below the Titlebar).
 *
 * File operations (model import, scene import, save, binaural export) all
 * live under File, Blender-style.
 */
import { useEffect, useRef, useState } from "react";
import type { WorkspaceInstance, WorkspacePreset } from "entropia-template-ui";
import {
  addPrim,
  bakeField,
  deleteSelected,
  exportWav,
  importModelFile,
  importSceneFile,
  renderScene,
  saveScene,
} from "../actions";
import { useCreatorStore, type WorkspaceId } from "../state/sceneStore";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

const WORKSPACES: { id: WorkspaceId; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "shading", label: "Shading" },
  { id: "simulation", label: "Simulation" },
  { id: "bake", label: "Bake" },
  { id: "delivery", label: "Delivery" },
];

export interface MenuBarProps {
  workspaces: WorkspaceInstance[];
  activeId: string;
  presets: WorkspacePreset[];
  onSwitch: (id: string) => void;
  onAdd: (presetId: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onReorder: (id: string, targetId: string) => void;
}

export function MenuBar(props: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const sceneInput = useRef<HTMLInputElement>(null);
  const setWorkspace = useCreatorStore((s) => s.setWorkspace);
  const resetViewport = useCreatorStore((s) => s.resetViewport);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: "File",
      items: [
        { label: "Import Model (.obj)…", shortcut: "⌘I", action: () => modelInput.current?.click() },
        { label: "Import Scene (.json)…", action: () => sceneInput.current?.click() },
        { separator: true, label: "" },
        { label: "Save Scene (.audio_usd.json)", shortcut: "⌘S", action: () => saveScene() },
        { label: "Export Binaural WAV…", shortcut: "⇧⌘E", action: () => void exportWav() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Add Emitter", action: () => addPrim("emitter") },
        { label: "Add Listener", action: () => addPrim("listener") },
        { label: "Add Environment", action: () => addPrim("environment") },
        { separator: true, label: "" },
        { label: "Delete Selection", shortcut: "⌫", action: () => deleteSelected() },
      ],
    },
    {
      label: "Render",
      items: [
        { label: "Render Binaural", shortcut: "⌘R", action: () => void renderScene() },
        { label: "Bake Splat Field (AudioGS)…", action: () => void bakeField() },
      ],
    },
    {
      label: "Window",
      items: [
        ...WORKSPACES.map((ws) => ({ label: `Workspace: ${ws.label}`, action: () => setWorkspace(ws.id) })),
        { separator: true, label: "" },
        { label: "Reset 3D View", action: () => resetViewport() },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Welcome Screen", action: () => openSplash() },
        { label: "GitHub Repository", action: () => window.open("https://github.com/SakuraEntropia/Entropia-Atmos", "_blank") },
        { label: "About Atmos", action: () => useCreatorStore.getState().openAbout() },
      ],
    },
  ];

  const snapEnabled = useCreatorStore((s) => s.snapEnabled);
  const setSnapEnabled = useCreatorStore((s) => s.setSnapEnabled);
  const snapStep = useCreatorStore((s) => s.snapStep);
  const setSnapStep = useCreatorStore((s) => s.setSnapStep);
  const coordSpace = useCreatorStore((s) => s.coordSpace);
  const setCoordSpace = useCreatorStore((s) => s.setCoordSpace);
  const openSplash = useCreatorStore((s) => s.openSplash);

  return (
    <div className="menubar" onClick={(e) => e.stopPropagation()}>
      <div
        className={`menu-item app-logo-item ${openMenu === "__app__" ? "active" : ""}`}
        title="Atmos"
        onClick={() => setOpenMenu(openMenu === "__app__" ? null : "__app__")}
      >
        <img src="/brand/logo.png" alt="Atmos" className="menubar-logo" />
        {openMenu === "__app__" && (
          <div className="dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="dropdown-item" onClick={() => { openSplash(); setOpenMenu(null); }}>Welcome Screen</div>
            <div className="dropdown-item" onClick={() => { window.open("https://github.com/SakuraEntropia/Entropia-Atmos", "_blank"); setOpenMenu(null); }}>GitHub Repository</div>
            <div className="dropdown-item" onClick={() => { useCreatorStore.getState().openAbout(); setOpenMenu(null); }}>About Atmos</div>
          </div>
        )}
      </div>
      <input
        ref={modelInput}
        type="file"
        accept=".obj"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importModelFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={sceneInput}
        type="file"
        accept=".json,.audio_usd"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importSceneFile(file);
          e.target.value = "";
        }}
      />
      {menus.map((menu) => (
        <div
          key={menu.label}
          className={`menu-item ${openMenu === menu.label ? "active" : ""}`}
          onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
        >
          {menu.label}
          {openMenu === menu.label && (
            <div className="dropdown" onClick={(e) => e.stopPropagation()}>
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} style={{ height: 1, background: "var(--color-border)", margin: "4px 8px" }} />
                ) : (
                  <div
                    key={i}
                    className="dropdown-item entro-dropdown-item"
                    onClick={() => {
                      setOpenMenu(null);
                      item.action?.();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span style={{ float: "right", opacity: 0.55, fontSize: 11 }}>{item.shortcut}</span>}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
      <TabBar
        workspaces={props.workspaces}
        activeId={props.activeId}
        presets={props.presets}
        onSwitch={(id) => {
          props.onSwitch(id);
          const instance = props.workspaces.find((w) => w.id === id);
          if (instance) setWorkspace(instance.name.toLowerCase() as WorkspaceId);
        }}
        onAdd={props.onAdd}
        onRemove={props.onRemove}
        onRename={props.onRename}
        onDuplicate={props.onDuplicate}
        onMove={props.onMove}
        onReorder={props.onReorder}
      />
      <div className="menubar-options">
        <button
          className={`menu-opt ${snapEnabled ? "active" : ""}`}
          title="Snapping (increment)"
          onClick={() => setSnapEnabled(!snapEnabled)}
        >
          🧲
        </button>
        <select className="menu-opt" title="Snap step" value={snapStep} onChange={(e) => setSnapStep(Number(e.target.value))}>
          <option value={0.1}>0.1</option>
          <option value={0.25}>0.25</option>
          <option value={0.5}>0.5</option>
          <option value={1}>1</option>
        </select>
        <select className="menu-opt" title="Coordinate system" value={coordSpace} onChange={(e) => setCoordSpace(e.target.value as "global" | "local")}>
          <option value="global">Global</option>
          <option value="local">Local</option>
        </select>
      </div>
    </div>
  );
}

/** Self-contained workspace tab bar (no external dependency on the
 * template's WorkspaceTabs): click to switch, "+" preset menu, right-click
 * context (rename/duplicate/move/remove), drag to reorder. */
function TabBar({
  workspaces,
  activeId,
  presets,
  onSwitch,
  onAdd,
  onRemove,
  onRename,
  onDuplicate,
  onMove,
  onReorder,
}: {
  workspaces: WorkspaceInstance[];
  activeId: string;
  presets: WorkspacePreset[];
  onSwitch: (id: string) => void;
  onAdd: (presetId: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onReorder: (id: string, targetId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="workspace-tabs-wrap">
      <div className="workspace-tabs">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            className={`workspace-tab ${ws.id === activeId ? "active" : ""}`}
            draggable
            onDragStart={() => setDragId(ws.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId && dragId !== ws.id) onReorder(dragId, ws.id);
              setDragId(null);
            }}
            onClick={() => onSwitch(ws.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtx({ id: ws.id, x: e.clientX, y: e.clientY });
            }}
          >
            {ws.name}
          </button>
        ))}
        <button className="workspace-add" title="Add workspace" onClick={() => setAddOpen((o) => !o)}>
          +
        </button>
      </div>
      {addOpen && (
        <>
          <div className="tab-menu-overlay" onClick={() => setAddOpen(false)} />
          <div className="tab-menu">
            <div className="tab-menu-title">Add workspace</div>
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="tab-menu-item"
                onClick={() => {
                  onAdd(preset.id);
                  setAddOpen(false);
                }}
              >
                {preset.label}
                <span className="tab-menu-hint">{preset.description}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {ctx && (
        <>
          <div className="tab-menu-overlay" onClick={() => setCtx(null)} />
          <div className="tab-menu fixed" style={{ left: ctx.x, top: ctx.y }}>
            <div className="tab-menu-item" onClick={() => { const name = window.prompt("Workspace name", workspaces.find((w) => w.id === ctx.id)?.name ?? ""); if (name) onRename(ctx.id, name); setCtx(null); }}>
              Rename
            </div>
            <div className="tab-menu-item" onClick={() => { onDuplicate(ctx.id); setCtx(null); }}>Duplicate</div>
            <div className="tab-menu-item" onClick={() => { onMove(ctx.id, -1); setCtx(null); }}>Move Left</div>
            <div className="tab-menu-item" onClick={() => { onMove(ctx.id, 1); setCtx(null); }}>Move Right</div>
            <div className="tab-menu-item" onClick={() => { onRemove(ctx.id); setCtx(null); }}>Remove</div>
          </div>
        </>
      )}
    </div>
  );
}
