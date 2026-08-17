/** Scene panel: emitters, listeners, materials, environments, geometry with
 * Blender-style model import (OBJ). */
import { useRef } from "react";
import { parseObj } from "../../../../src/formats/obj/index";
import { useCreatorStore, type PrimType } from "../state/sceneStore";

const SECTIONS: { type: PrimType; label: string; icon: string }[] = [
  { type: "emitter", label: "Emitters", icon: "◉" },
  { type: "listener", label: "Listeners", icon: "◎" },
  { type: "geometry", label: "Geometry", icon: "⬡" },
  { type: "material", label: "Materials", icon: "▦" },
  { type: "environment", label: "Environments", icon: "≈" },
];

function addEmitterPayload(): Record<string, unknown> {
  return {
    transform: { position: [2, 1.5, 1.5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    kind: "point",
    signal: { ref: "source:auto", level: 0 },
  };
}

function addListenerPayload(): Record<string, unknown> {
  return {
    transform: { position: [3, 1.5, 1.5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  };
}

function addMaterialPayload(): Record<string, unknown> {
  return {
    bands: [
      { centerHz: 500, lowHz: 354, highHz: 707, absorption: 0.1, scattering: 0.1, transmission: 0 },
      { centerHz: 1000, lowHz: 707, highHz: 1414, absorption: 0.08, scattering: 0.1, transmission: 0 },
      { centerHz: 2000, lowHz: 1414, highHz: 2828, absorption: 0.07, scattering: 0.1, transmission: 0 },
      { centerHz: 4000, lowHz: 2828, highHz: 5657, absorption: 0.06, scattering: 0.1, transmission: 0 },
    ],
  };
}

function addEnvironmentPayload(): Record<string, unknown> {
  return { temperatureCelsius: 20, humidityPercent: 50, airAbsorptionModel: "iso-9613-1" };
}

export function ScenePanel() {
  const document = useCreatorStore((s) => s.document);
  const selection = useCreatorStore((s) => s.selection);
  const select = useCreatorStore((s) => s.select);
  const logLine = useCreatorStore((s) => s.logLine);
  const hiddenIds = useCreatorStore((s) => s.hiddenIds);
  const toggleHidden = useCreatorStore((s) => s.toggleHidden);
  const deleteSelection = useCreatorStore((s) => s.deleteSelection);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!document) {
    return <div className="scene-panel">loading scene…</div>;
  }

  const primsOf = (type: PrimType) => document.layers.flatMap((l) => l.prims).filter((p) => p.type === type);
  const firstMaterialId = primsOf("material")[0]?.id;
  const wallMaterialId = (document.room?.wallMaterialId as string | undefined) ?? firstMaterialId;

  const addPrim = (type: PrimType) => {
    const payload =
      type === "emitter" ? addEmitterPayload()
      : type === "listener" ? addListenerPayload()
      : type === "material" ? addMaterialPayload()
      : addEnvironmentPayload();
    const id = `${type.slice(0, 1)}${Date.now().toString(36)}`;
    document.layers[0].prims.push({ type, id, name: `${type}-${id}`, payload });
    useCreatorStore.setState({ document: { ...document } });
    select({ type, id });
    logLine(`added ${type} '${id}'`);
  };

  const importObj = async (file: File) => {
    try {
      const mesh = parseObj(await file.text());
      const id = `g${Date.now().toString(36)}`;
      const name = file.name.replace(/\.obj$/i, "");
      document.layers[0].prims.push({
        type: "geometry",
        id,
        name,
        payload: {
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          materialId: wallMaterialId,
          mesh: { positions: Array.from(mesh.positions), triangles: Array.from(mesh.triangles) },
        },
      });
      useCreatorStore.setState({ document: { ...document } });
      select({ type: "geometry", id });
      logLine(`imported model '${file.name}' (${mesh.triangles.length / 3} triangles)`);
    } catch (error) {
      logLine(`import failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  return (
    <div className="scene-panel">
      <input
        ref={fileRef}
        type="file"
        accept=".obj"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importObj(file);
          e.target.value = "";
        }}
      />
      <div className="scene-tools">
        <button className="mini-btn wide" title="Import a Wavefront OBJ model (Blender-style import)" onClick={() => fileRef.current?.click()}>
          ⬇ Import .obj
        </button>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.type} className="scene-section">
          <div className="scene-section-head">
            <span>{section.icon} {section.label}</span>
            {section.type !== "geometry" && (
              <button className="mini-btn" title={`add ${section.type}`} onClick={() => addPrim(section.type)}>
                +
              </button>
            )}
          </div>
          {primsOf(section.type).map((prim) => (
            <div
              key={prim.id}
              className={`scene-item ${selection?.type === section.type && selection.id === prim.id ? "selected" : ""}`}
              onClick={() => select({ type: section.type, id: prim.id })}
            >
              <button
                className="outliner-eye"
                title={hiddenIds.includes(prim.id) ? "show in viewport" : "hide in viewport"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHidden(prim.id);
                }}
              >
                {hiddenIds.includes(prim.id) ? "◇" : "👁"}
              </button>
              <span className="scene-item-name">{prim.name}</span>
              <button
                className="outliner-x"
                title="delete"
                onClick={(e) => {
                  e.stopPropagation();
                  select({ type: section.type, id: prim.id });
                  deleteSelection();
                  logLine(`deleted ${section.type} '${prim.id}'`);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {primsOf(section.type).length === 0 && <div className="scene-item muted">— empty —</div>}
        </div>
      ))}
    </div>
  );
}
