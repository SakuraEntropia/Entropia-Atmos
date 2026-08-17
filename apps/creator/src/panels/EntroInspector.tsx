/** ENTRO context panel — workspace-specific engine controls (Phase 4).
 *
 * Bake: AudioGS field building · Layout: scene loading · Shading: materials
 * · Simulation: solver runs · Delivery: binaural export. All calls go to
 * the creator backend through the /api proxy.
 */
import { useCallback, useEffect, useState } from "react";

let activeWorkspace = "layout";
const listeners = new Set<() => void>();

export function setActiveWorkspace(id: string): void {
  activeWorkspace = id;
  for (const listener of listeners) listener();
}

interface SceneInfo {
  name: string;
  emitters: number;
  listeners: number;
  materials: number;
  environments: number;
  room?: string;
  splatFields: number;
}

interface ApiStatus {
  version: string;
  phase: string;
  scenes: string[];
}

function useActiveWorkspace(): string {
  const [ws, setWs] = useState(activeWorkspace);
  useEffect(() => {
    const update = () => setWs(activeWorkspace);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return ws;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json() as Promise<T>;
}

export function EntroInspector() {
  const ws = useActiveWorkspace();
  return (
    <div style={{ padding: 10, fontSize: 13, lineHeight: 1.5, overflowY: "auto", height: "100%" }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>ENTRO · {ws}</div>
      {ws === "bake" && <BakeSection />}
      {ws === "layout" && <LayoutSection />}
      {ws === "shading" && <ShadingSection />}
      {ws === "simulation" && <SimulationSection />}
      {ws === "delivery" && <DeliverySection />}
    </div>
  );
}

function BakeSection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const run = useCallback(async () => {
    setBusy(true);
    setResult("building AudioGS field…");
    try {
      const data = await post<{ message: string }>("/api/audiogs", { scene: "shoebox", grid: 5, bands: 4 });
      setResult(data.message);
    } catch (error) {
      setResult(`failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  }, []);
  return (
    <div>
      <p>AudioGS training and preprocessing. The analytic projection pipeline is
      the baseline; the differentiable trainer (0002) plugs in here.</p>
      <button disabled={busy} onClick={run}>Build splat field (shoebox, grid 5)</button>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{result}</pre>
    </div>
  );
}

function LayoutSection() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [scene, setScene] = useState<SceneInfo | null>(null);
  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => undefined);
  }, []);
  const load = useCallback(async (name: string) => {
    try {
      const data = await post<SceneInfo>("/api/scene/load", { name });
      setScene(data);
    } catch (error) {
      setScene(null);
    }
  }, []);
  return (
    <div>
      <p>Audio-USD scene construction: emitters, listeners, environments,
      materials, geometry, splat fields.</p>
      <div>Scenes:</div>
      <ul style={{ marginTop: 4 }}>
        {(status?.scenes ?? []).map((name) => (
          <li key={name}>
            <button onClick={() => load(name)}>{name}</button>
          </li>
        ))}
      </ul>
      {scene && (
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
          {`${scene.name}: ${scene.emitters} emitter(s), ${scene.listeners} listener(s), ` +
            `${scene.materials} material(s), ${scene.environments} environment(s), ` +
            `${scene.splatFields} splat field(s)${scene.room ? `, room ${scene.room}` : ""}`}
        </pre>
      )}
    </div>
  );
}

function ShadingSection() {
  const [material, setMaterial] = useState<{ name: string; bands: { centerHz: number; absorption: number }[] } | null>(null);
  useEffect(() => {
    fetch("/api/material/concrete").then((r) => r.json()).then(setMaterial).catch(() => undefined);
  }, []);
  return (
    <div>
      <p>Acoustic material definition — the parameter surface of the
      Acoustic-BRDF (per-band absorption / scattering / transmission).</p>
      {material && (
        <table style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Band</th>
              <th style={th}>Absorption</th>
            </tr>
          </thead>
          <tbody>
            {material.bands.map((band) => (
              <tr key={band.centerHz}>
                <td style={td}>{band.centerHz} Hz</td>
                <td style={td}>{band.absorption.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", borderBottom: "1px solid #888", padding: 4 };
const td: React.CSSProperties = { padding: 4 };

function SimulationSection() {
  const [solver, setSolver] = useState("image-source");
  const [order, setOrder] = useState(3);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const run = useCallback(async () => {
    setBusy(true);
    setResult("baking + rendering…");
    try {
      const data = await post<{ message: string }>("/api/render", {
        scene: "shoebox",
        solver,
        order,
        impulse: true,
        duration: 0.5,
      });
      setResult(data.message);
    } catch (error) {
      setResult(`failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  }, [solver, order]);
  return (
    <div>
      <p>Physical acoustic solving: pick a solver, bake DIRs, render binaural.</p>
      <div style={{ marginTop: 8 }}>
        <label>Solver </label>
        <select value={solver} onChange={(e) => setSolver(e.target.value)}>
          <option value="image-source">image-source (shoebox)</option>
          <option value="ray-tracing">ray-tracing (meshes)</option>
          <option value="splat-field">splat-field (AudioGS)</option>
        </select>
      </div>
      <div style={{ marginTop: 6 }}>
        <label>Order </label>
        <input
          type="number"
          min={0}
          max={10}
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          style={{ width: 60 }}
        />
      </div>
      <button disabled={busy} onClick={run} style={{ marginTop: 8 }}>
        {busy ? "Running…" : "Bake + render"}
      </button>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{result}</pre>
    </div>
  );
}

function DeliverySection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const run = useCallback(async () => {
    setBusy(true);
    setResult("exporting…");
    try {
      const data = await post<{ message: string }>("/api/export", { scene: "shoebox", solver: "image-source" });
      setResult(data.message);
    } catch (error) {
      setResult(`failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  }, []);
  return (
    <div>
      <p>Plugin ecosystem: deliver baked scenes as binaural WAVs today; VST3 /
      AU bridges are the Phase 5 delivery targets (host simulator + packaging
      live in the core repo).</p>
      <button disabled={busy} onClick={run}>Export binaural WAV</button>
      <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{result}</pre>
    </div>
  );
}
