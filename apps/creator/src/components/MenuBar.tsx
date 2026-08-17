/** ENTRO ATMOS menu bar — File / Edit / Render / Window / Help plus the
 * ENTRO workspace tabs, all in ONE bar, mirroring the original template
 * UI (which renders its menus and workspace tabs inside a single
 * `.menubar` below the Titlebar).
 *
 * File operations (model import, scene import, save, binaural export) all
 * live under File, Blender-style.
 */
import { useEffect, useRef, useState } from "react";
import { WorkspaceTabs, type WorkspaceInstance, type WorkspacePreset } from "entropia-template-ui";
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
        { label: "Add Material", action: () => addPrim("material") },
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
        { label: "GitHub Repository", action: () => window.open("https://github.com/SakuraEntropia/Entropia-Atmos", "_blank") },
        { label: "About ENTRO ATMOS", action: () => window.alert("ENTRO ATMOS — AI + Graphics inspired spatial audio engine\nBlender for spatial audio.") },
      ],
    },
  ];

  return (
    <div className="menubar" onClick={(e) => e.stopPropagation()}>
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
      <div className="workspace-tabs-wrap" style={{ marginLeft: "auto" }}>
        <WorkspaceTabs
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
      </div>
    </div>
  );
}
