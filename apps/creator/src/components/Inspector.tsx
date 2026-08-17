/** Inspector: contextual editors for the selection + simulation controls. */
import { useState } from "react";
import {
  selectedPrim,
  setTransformPosition,
  setTransformRotation,
  transformOf,
  useCreatorStore,
} from "../state/sceneStore";

function num(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function Vec3Row({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  step?: number;
  onChange: (v: [number, number, number]) => void;
}) {
  return (
    <div className="vec3-row">
      <span className="vec3-label">{label}</span>
      {(["x", "y", "z"] as const).map((axis, i) => (
        <label key={axis} className="vec3-field">
          {axis}
          <input
            type="number"
            step={step}
            value={Number(value[i].toFixed(3))}
            onChange={(e) => {
              const next = [...value] as [number, number, number];
              next[i] = Number(e.target.value);
              onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

function EmitterEditor({ id }: { id: string }) {
  const document = useCreatorStore((s) => s.document);
  const update = useCreatorStore((s) => s.updatePayload);
  const prim = selectedPrim(document, { type: "emitter", id });
  if (!prim) return null;
  const transform = transformOf(prim.payload);
  const kind = num(prim.payload.kind, 0);
  const level = num((prim.payload.signal as Record<string, unknown> | undefined)?.level, 0);
  return (
    <div className="inspector-body">
      <h4>Sound Emitter — {prim.name}</h4>
      <Vec3Row label="Position" value={transform.position} onChange={(v) => update("emitter", id, (p) => setTransformPosition(p, v))} />
      <label className="field">
        Type
        <select
          value={String(prim.payload.kind ?? "point")}
          onChange={(e) => update("emitter", id, (p) => void (p.kind = e.target.value))}
        >
          <option value="point">point</option>
          <option value="area">area</option>
          <option value="ambient">ambient</option>
        </select>
      </label>
      <label className="field">
        Level (dB)
        <input
          type="number"
          step={1}
          value={level}
          onChange={(e) =>
            update("emitter", id, (p) => {
              const signal = (p.signal ?? {}) as Record<string, unknown>;
              signal.level = Number(e.target.value);
              p.signal = signal;
            })
          }
        />
      </label>
      <p className="muted">Drag the emitter in the 3D view to panner it.</p>
      <span className="hidden">{kind}</span>
    </div>
  );
}

function ListenerEditor({ id }: { id: string }) {
  const document = useCreatorStore((s) => s.document);
  const update = useCreatorStore((s) => s.updatePayload);
  const prim = selectedPrim(document, { type: "listener", id });
  if (!prim) return null;
  const transform = transformOf(prim.payload);
  return (
    <div className="inspector-body">
      <h4>Listener — {prim.name}</h4>
      <Vec3Row label="Position" value={transform.position} onChange={(v) => update("listener", id, (p) => setTransformPosition(p, v))} />
      <label className="field">
        Yaw (°, around +y)
        <input
          type="number"
          step={5}
          defaultValue={0}
          onChange={(e) => {
            const yaw = (Number(e.target.value) * Math.PI) / 180;
            update("listener", id, (p) =>
              setTransformRotation(p, [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)])
            );
          }}
        />
      </label>
      <p className="muted">The nose cone shows the head orientation (+z forward).</p>
    </div>
  );
}

function MaterialEditor({ id }: { id: string }) {
  const document = useCreatorStore((s) => s.document);
  const update = useCreatorStore((s) => s.updatePayload);
  const prim = selectedPrim(document, { type: "material", id });
  if (!prim) return null;
  const bands = (prim.payload.bands ?? []) as Record<string, unknown>[];
  return (
    <div className="inspector-body">
      <h4>Acoustic Material — {prim.name}</h4>
      <p className="muted">Per-band absorption (the Acoustic-BRDF surface).</p>
      {bands.map((band, i) => (
        <div key={i} className="band-row">
          <span className="band-label">{String(band.centerHz)} Hz</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={num(band.absorption, 0.1)}
            onChange={(e) =>
              update("material", id, (p) => {
                ((p.bands as Record<string, unknown>[])[i]).absorption = Number(e.target.value);
              })
            }
          />
          <span className="band-value">{num(band.absorption, 0.1).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function EnvironmentEditor({ id }: { id: string }) {
  const document = useCreatorStore((s) => s.document);
  const update = useCreatorStore((s) => s.updatePayload);
  const prim = selectedPrim(document, { type: "environment", id });
  if (!prim) return null;
  return (
    <div className="inspector-body">
      <h4>Environment — {prim.name}</h4>
      <label className="field">
        Temperature (°C)
        <input
          type="number"
          step={1}
          value={num(prim.payload.temperatureCelsius, 20)}
          onChange={(e) => update("environment", id, (p) => void (p.temperatureCelsius = Number(e.target.value)))}
        />
      </label>
      <label className="field">
        Humidity (%)
        <input
          type="number"
          step={1}
          value={num(prim.payload.humidityPercent, 50)}
          onChange={(e) => update("environment", id, (p) => void (p.humidityPercent = Number(e.target.value)))}
        />
      </label>
      <p className="muted">Feeds ISO 9613-1 air absorption per band.</p>
    </div>
  );
}

function SimulationControls() {
  const solver = useCreatorStore((s) => s.solver);
  const maxOrder = useCreatorStore((s) => s.maxOrder);
  const rayBudget = useCreatorStore((s) => s.rayBudget);
  const lateDuration = useCreatorStore((s) => s.lateDuration);
  const setSolver = useCreatorStore((s) => s.setSolver);
  const setMaxOrder = useCreatorStore((s) => s.setMaxOrder);
  const setRayBudget = useCreatorStore((s) => s.setRayBudget);
  const setLateDuration = useCreatorStore((s) => s.setLateDuration);
  return (
    <div className="inspector-body simulation">
      <h4>Simulation</h4>
      <label className="field">
        Solver
        <select value={solver} onChange={(e) => setSolver(e.target.value)}>
          <option value="image-source">image-source (rooms)</option>
          <option value="ray-tracing">ray-tracing (meshes)</option>
          <option value="splat-field">splat-field (AudioGS)</option>
        </select>
      </label>
      <label className="field">
        Reflection order
        <input type="number" min={0} max={10} value={maxOrder} onChange={(e) => setMaxOrder(Number(e.target.value))} />
      </label>
      {solver === "ray-tracing" && (
        <label className="field">
          Ray budget
          <input type="number" min={100} step={500} value={rayBudget} onChange={(e) => setRayBudget(Number(e.target.value))} />
        </label>
      )}
      <label className="field">
        Late field (s, 0 = off)
        <input type="number" min={0} step={0.1} value={lateDuration} onChange={(e) => setLateDuration(Number(e.target.value))} />
      </label>
    </div>
  );
}

function GeometryEditor({ id }: { id: string }) {
  const document = useCreatorStore((s) => s.document);
  const update = useCreatorStore((s) => s.updatePayload);
  const prim = selectedPrim(document, { type: "geometry", id });
  if (!prim) return null;
  const transform = transformOf(prim.payload);
  const mesh = prim.payload.mesh as { triangles?: number[] } | undefined;
  const materialIds = document?.layers.flatMap((l) => l.prims).filter((p) => p.type === "material").map((p) => p.id) ?? [];
  return (
    <div className="inspector-body">
      <h4>Geometry — {prim.name}</h4>
      <Vec3Row label="Position" value={transform.position} onChange={(v) => update("geometry", id, (p) => setTransformPosition(p, v))} />
      <label className="field">
        Material
        <select
          value={String(prim.payload.materialId ?? "")}
          onChange={(e) => update("geometry", id, (p) => void (p.materialId = e.target.value || undefined))}
        >
          <option value="">(default wall)</option>
          {materialIds.map((mid) => (
            <option key={mid} value={mid}>{mid}</option>
          ))}
        </select>
      </label>
      <p className="muted">{mesh?.triangles ? `${mesh.triangles.length / 3} triangles — drag it in the 3D view to move it.` : "no mesh data"}</p>
    </div>
  );
}

export function Inspector() {
  const selection = useCreatorStore((s) => s.selection);
  const workspace = useCreatorStore((s) => s.workspace);
  const [tab, setTab] = useState<"selection" | "simulation">("selection");

  return (
    <div className="inspector">
      <div className="inspector-tabs">
        <button className={tab === "selection" ? "active" : ""} onClick={() => setTab("selection")}>Selection</button>
        <button className={tab === "simulation" ? "active" : ""} onClick={() => setTab("simulation")}>Simulation</button>
      </div>
      {tab === "simulation" || workspace === "simulation" ? <SimulationControls /> : null}
      {tab === "selection" && (
        <>
          {selection?.type === "emitter" && <EmitterEditor id={selection.id} />}
          {selection?.type === "listener" && <ListenerEditor id={selection.id} />}
          {selection?.type === "material" && <MaterialEditor id={selection.id} />}
          {selection?.type === "environment" && <EnvironmentEditor id={selection.id} />}
          {selection?.type === "geometry" && <GeometryEditor id={selection.id} />}
          {!selection && <p className="muted pad">Select an emitter, listener, material, geometry, or environment.</p>}
        </>
      )}
    </div>
  );
}
