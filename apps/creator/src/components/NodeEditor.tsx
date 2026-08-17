/** Acoustic material node editor (Blender-style), rewritten with fully
 * controlled React Flow state: immutable per-material graphs in the store,
 * parameter edits committed atomically, texture nodes show thumbnails and
 * inline load buttons, Backspace/Delete removes selected nodes. */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import { NODE_CATEGORIES, NODE_DEFS, getNodeDef } from "../nodes/nodeDefs";
import { evaluateGraph, type NodeGraph } from "../nodes/evaluate";
import { useCreatorStore, type AcousticNodeData } from "../state/sceneStore";

const ANALYSIS_CENTERS = [500, 1000, 2000, 4000];

// --- texture assets (module-level, referenced by node id) --------------------

const imageAssets: Record<string, { data: Uint8ClampedArray; width: number; height: number; url: string }> = {};
const videoAssets: Record<string, { element: HTMLVideoElement; url: string }> = {};
let assetVersion = 0;
const assetListeners = new Set<() => void>();

function bumpAssets(): void {
  assetVersion++;
  for (const listener of assetListeners) listener();
}

function useAssetVersion(): number {
  const [version, setVersion] = useState(assetVersion);
  useEffect(() => {
    const update = () => setVersion(assetVersion);
    assetListeners.add(update);
    return () => {
      assetListeners.delete(update);
    };
  }, []);
  return version;
}

function openAssetPicker(nodeId: string, kind: "image" | "video"): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = kind === "image" ? "image/*" : "video/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const logLine = useCreatorStore.getState().logLine;
    if (kind === "image") {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        imageAssets[nodeId] = { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, url };
        bumpAssets();
        logLine(`loaded image '${file.name}' (${canvas.width}×${canvas.height})`);
      };
      img.onerror = () => logLine(`image load failed: ${file.name}`);
      img.src = url;
    } else {
      const video = document.createElement("video");
      video.src = url;
      video.loop = true;
      video.muted = true;
      void video.play().catch(() => undefined);
      videoAssets[nodeId] = { element: video, url };
      bumpAssets();
      logLine(`loaded video '${file.name}'`);
    }
  };
  input.click();
}

// --- node card ----------------------------------------------------------------

function AcousticNodeCard({ id, data }: { id: string; data: AcousticNodeData }) {
  const def = getNodeDef(data.nodeType);
  useAssetVersion();
  if (!def) return null;

  const setParam = (name: string, value: number) => {
    const state = useCreatorStore.getState();
    const key = state.selection?.type === "material" ? state.selection.id : "";
    if (!key) return;
    const current = state.graphs[key] ?? { nodes: [], edges: [] };
    const nodes = current.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, [name]: value } } } : n
    );
    state.setGraph(key, { nodes, edges: current.edges });
  };

  const isOutput = def.category === "Output";
  const isTexture = data.nodeType === "imageTexture" || data.nodeType === "videoTexture";

  return (
    <div className={`anode ${isOutput ? "output" : ""}`}>
      <div className="anode-title">{def.label}</div>
      {def.inputs.map((socket) => (
        <div className="anode-socket" key={socket.name}>
          <Handle type="target" position={Position.Left} id={socket.name} />
          <span className={`anode-kind ${socket.kind.toLowerCase()}`}>{socket.kind}</span>
          <span>{socket.name}</span>
        </div>
      ))}
      {def.outputs.map((socket) => (
        <div className="anode-socket out" key={socket.name}>
          <span>{socket.name}</span>
          <span className={`anode-kind ${socket.kind.toLowerCase()}`}>{socket.kind}</span>
          <Handle type="source" position={Position.Right} id={socket.name} />
        </div>
      ))}
      {isTexture && (
        <div className="anode-assets">
          {data.nodeType === "imageTexture" && imageAssets[id] ? (
            <img className="anode-thumb" src={imageAssets[id].url} alt="texture" />
          ) : data.nodeType === "videoTexture" && videoAssets[id] ? (
            <video className="anode-thumb" src={videoAssets[id].url} muted loop autoPlay />
          ) : (
            <div className="anode-thumb empty">no {data.nodeType === "imageTexture" ? "image" : "video"}</div>
          )}
          <button className="anode-asset" onClick={() => openAssetPicker(id, data.nodeType === "imageTexture" ? "image" : "video")}>
            Load {data.nodeType === "imageTexture" ? "image" : "video"}…
          </button>
        </div>
      )}
      {def.params.map((param) => (
        <label className="anode-param" key={param.name}>
          <span>{param.name}</span>
          <input
            type="number"
            step={param.kind === "int" ? 1 : 0.01}
            value={data.params[param.name] ?? param.default}
            onChange={(e) => setParam(param.name, Number(e.target.value))}
          />
        </label>
      ))}
    </div>
  );
}

const nodeTypes = { acoustic: AcousticNodeCard };

// --- editor --------------------------------------------------------------------

let nodeUid = 0;

export function NodeEditor() {
  const selection = useCreatorStore((s) => s.selection);
  const materialId = selection?.type === "material" ? selection.id : "";
  const graphs = useCreatorStore((s) => s.graphs);
  const setGraph = useCreatorStore((s) => s.setGraph);
  const updatePayload = useCreatorStore((s) => s.updatePayload);
  const logLine = useCreatorStore((s) => s.logLine);

  const graph = materialId ? graphs[materialId] ?? { nodes: [], edges: [] } : { nodes: [], edges: [] };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!materialId) return;
      setGraph(materialId, {
        nodes: applyNodeChanges(changes, graph.nodes) as Node<AcousticNodeData>[],
        edges: graph.edges,
      });
    },
    [materialId, graph, setGraph]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!materialId) return;
      setGraph(materialId, { nodes: graph.nodes, edges: applyEdgeChanges(changes, graph.edges) });
    },
    [materialId, graph, setGraph]
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!materialId) return;
      setGraph(materialId, { nodes: graph.nodes, edges: addEdge(connection, graph.edges) });
    },
    [materialId, graph, setGraph]
  );

  const addNode = (type: string) => {
    if (!materialId) return;
    const def = getNodeDef(type);
    if (!def) return;
    const id = `n${++nodeUid}`;
    const params: Record<string, number> = {};
    for (const param of def.params) params[param.name] = param.default;
    const node: Node<AcousticNodeData> = {
      id,
      type: "acoustic",
      position: { x: 60 + (graph.nodes.length % 6) * 60, y: 40 + (graph.nodes.length % 8) * 90 },
      data: { id, nodeType: type, label: def.label, params },
    };
    setGraph(materialId, { nodes: [...graph.nodes, node], edges: graph.edges });
  };

  const bake = () => {
    if (!materialId) return;
    const graphData: NodeGraph = {
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.data.nodeType, params: n.data.params })),
      edges: graph.edges.map((e) => ({
        from: { nodeId: e.source, socket: e.sourceHandle ?? "" },
        to: { nodeId: e.target, socket: e.targetHandle ?? "" },
      })),
    };
    try {
      updatePayload("material", materialId, (payload) => {
        const bands: Record<string, unknown>[] = ANALYSIS_CENTERS.map((center, band) => {
          const outputs = evaluateGraph(graphData, {
            u: 0.5,
            v: 0.5,
            world: { x: 0, y: 0, z: 0 },
            band,
            time: 0,
            images: Object.fromEntries(Object.entries(imageAssets).map(([k, v]) => [k, v])),
            videos: Object.fromEntries(Object.entries(videoAssets).map(([k, v]) => [k, v.element])),
          });
          let absorption = 0;
          let scattering = 0;
          let transmission = 0;
          for (const out of Object.values(outputs)) {
            absorption = Math.max(absorption, out.absorption);
            scattering = Math.max(scattering, out.scattering);
            transmission = Math.max(transmission, out.transmission);
          }
          return {
            centerHz: center,
            lowHz: center / Math.SQRT2,
            highHz: center * Math.SQRT2,
            absorption,
            scattering,
            transmission,
          };
        });
        payload.bands = bands;
      });
      logLine(`baked node graph → material '${materialId}' bands (4 analysis bands)`);
    } catch (error) {
      logLine(`bake failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const palette = useMemo(
    () => NODE_CATEGORIES.map((category) => ({ category, defs: NODE_DEFS.filter((d) => d.category === category) })),
    []
  );

  return (
    <div className="node-editor">
      <div className="node-toolbar">
        <button className="mini-btn wide" disabled={!materialId} onClick={bake}>
          Bake to material
        </button>
        <span className="muted">
          {materialId ? `editing '${materialId}' — Backspace deletes nodes` : "select a material in the Scene panel first"}
        </span>
      </div>
      <div className="node-editor-body">
        <div className="node-palette">
          {palette.map((group) => (
            <div key={group.category} className="node-palette-group">
              <div className="node-palette-cat">{group.category}</div>
              {group.defs.map((def) => (
                <button key={def.type} className="node-palette-item" disabled={!materialId} onClick={() => addNode(def.type)}>
                  {def.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="node-canvas">
          {materialId ? (
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          ) : (
            <div className="muted pad">Select a material in the Scene panel to edit its acoustic node graph.</div>
          )}
        </div>
      </div>
    </div>
  );
}
