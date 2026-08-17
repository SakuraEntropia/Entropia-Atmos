/** Blender-style acoustic material node editor (React Flow).
 *
 * Nodes: texture coordinate, time, value, perlin noise, checker, image and
 * video textures, math (add/sub/mul/div/power/sine/clamp/map-range/mix),
 * vector math, combine/separate XYZ, and Absorption/Scattering/Transmission
 * outputs. "Bake to material" evaluates the graph per analysis band and
 * writes the Acoustic-BRDF band coefficients.
 */
import { useCallback, useMemo } from "react";
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
import { evaluateGraph, bakeGraphBands, type NodeGraph } from "../nodes/evaluate";
import { useCreatorStore, type AcousticNodeData } from "../state/sceneStore";

const ANALYSIS_CENTERS = [500, 1000, 2000, 4000];

const imageAssets: Record<string, { data: Uint8ClampedArray; width: number; height: number }> = {};
const videoAssets: Record<string, HTMLVideoElement> = {};

/** Open a file picker for a texture node (module-level asset store). */
function openAssetPicker(nodeId: string, kind: "image" | "video"): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = kind === "image" ? "image/*" : "video/*";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const logLine = useCreatorStore.getState().logLine;
    if (kind === "image") {
      void createImageBitmap(file)
        .then((bitmap) => {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          imageAssets[nodeId] = { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
          logLine(`loaded image '${file.name}' (${canvas.width}×${canvas.height}) into node ${nodeId}`);
        })
        .catch((error) => logLine(`image load failed: ${error instanceof Error ? error.message : error}`));
    } else {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.loop = true;
      video.muted = true;
      void video.play().catch(() => undefined);
      videoAssets[nodeId] = video;
      logLine(`loaded video '${file.name}' into node ${nodeId}`);
    }
  };
  input.click();
}

function AcousticNodeView({ data }: { data: AcousticNodeData }) {
  const def = getNodeDef(data.nodeType);
  if (!def) return null;
  return (
    <div className="anode">
      <div className="anode-title">{def.label}</div>
      {def.inputs.map((socket) => (
        <div className="anode-socket" key={socket.name}>
          <Handle type="target" position={Position.Left} id={socket.name} className="anode-handle" />
          <span className={`anode-kind ${socket.kind.toLowerCase()}`}>{socket.kind}</span>
          <span>{socket.name}</span>
        </div>
      ))}
      {def.outputs.map((socket) => (
        <div className="anode-socket out" key={socket.name}>
          <span>{socket.name}</span>
          <span className={`anode-kind ${socket.kind.toLowerCase()}`}>{socket.kind}</span>
          <Handle type="source" position={Position.Right} id={socket.name} className="anode-handle" />
        </div>
      ))}
      {(data.nodeType === "imageTexture" || data.nodeType === "videoTexture") && (
        <button className="anode-asset" onClick={() => openAssetPicker((data as unknown as { id?: string }).id ?? "", data.nodeType === "imageTexture" ? "image" : "video")}>
          {data.nodeType === "imageTexture" ? "Load image…" : "Load video…"}
        </button>
      )}
      {def.params.map((param) => (
        <label className="anode-param" key={param.name}>
          <span>{param.name}</span>
          <input
            type="number"
            step={param.kind === "int" ? 1 : 0.01}
            value={data.params[param.name] ?? param.default}
            onChange={(e) => {
              data.params[param.name] = Number(e.target.value);
              const key = graphKey();
              const current = useCreatorStore.getState().graphs[key] ?? { nodes: [], edges: [] };
              useCreatorStore.getState().setGraph(key, { nodes: [...current.nodes], edges: current.edges });
            }}
          />
        </label>
      ))}
    </div>
  );
}

function graphKey(): string {
  const selection = useCreatorStore.getState().selection;
  return selection?.type === "material" ? selection.id : "";
}

function AcousticNodeShim(props: { data: AcousticNodeData }) {
  return <AcousticNodeView data={props.data} />;
}

const nodeTypes = { acoustic: AcousticNodeShim };

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
      setGraph(materialId, { nodes: applyNodeChanges(changes, graph.nodes) as Node<AcousticNodeData>[], edges: graph.edges });
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
    const params: Record<string, number> = {};
    for (const param of def.params) params[param.name] = param.default;
    const id = `n${++nodeUid}`;
    const node: Node<AcousticNodeData> = {
      id,
      type: "acoustic",
      position: { x: 40 + Math.random() * 120, y: 40 + Math.random() * 120 },
      data: { id, nodeType: type, label: def.label, params },
    };
    setGraph(materialId, { nodes: [...graph.nodes, node], edges: graph.edges });
  };

  const bake = () => {
    if (!materialId) return;
    const graphData: NodeGraph = {
      nodes: graph.nodes.map((n) => ({ id: n.id, type: n.data.nodeType, params: n.data.params })),
      edges: graph.edges.map((e) => ({ from: { nodeId: e.source, socket: e.sourceHandle ?? "" }, to: { nodeId: e.target, socket: e.targetHandle ?? "" } })),
    };
    try {
      updatePayload("material", materialId, (payload) => {
        const bands: Record<string, unknown>[] = Array.from({ length: 4 }, (_, band) => {
          const context = {
            u: 0.5,
            v: 0.5,
            world: { x: 0, y: 0, z: 0 },
            band,
            time: 0,
            images: imageAssets,
            videos: videoAssets,
          };
          const outputs = evaluateGraph(graphData, context);
          let absorption = 0;
          let scattering = 0;
          let transmission = 0;
          for (const out of Object.values(outputs)) {
            absorption = Math.max(absorption, out.absorption);
            scattering = Math.max(scattering, out.scattering);
            transmission = Math.max(transmission, out.transmission);
          }
          return { centerHz: ANALYSIS_CENTERS[band], lowHz: ANALYSIS_CENTERS[band] / Math.SQRT2, highHz: ANALYSIS_CENTERS[band] * Math.SQRT2, absorption, scattering, transmission };
        });
        payload.bands = bands;
      });
      logLine(`baked node graph → material '${materialId}' bands`);
    } catch (error) {
      logLine(`bake failed: ${error instanceof Error ? error.message : error}`);
    }
    void bakeGraphBands;
  };

  const palette = useMemo(() => {
    return NODE_CATEGORIES.map((category) => ({
      category,
      defs: NODE_DEFS.filter((d) => d.category === category),
    }));
  }, []);

  return (
    <div className="node-editor">
      <div className="node-toolbar">
        <button className="mini-btn wide" disabled={!materialId} onClick={bake}>Bake to material</button>
        <span className="muted">{materialId ? `editing material: ${materialId}` : "select a material to edit its node graph"}</span>
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
