/** Blender-style left toolbar for the 3D viewport: active tool selection
 * (Select / Move / Rotate / Scale) and view helpers. */
import { useCreatorStore } from "../state/sceneStore";

const TOOLS: { id: "select" | "move" | "rotate" | "scale"; label: string; icon: string; hint: string }[] = [
  { id: "select", label: "Select", icon: "◉", hint: "Click to select (T)" },
  { id: "move", label: "Move", icon: "✥", hint: "Drag gizmo arrows to move" },
  { id: "rotate", label: "Rotate", icon: "⟳", hint: "Drag gizmo rings to rotate" },
  { id: "scale", label: "Scale", icon: "⤢", hint: "Drag gizmo arrows to scale" },
];

export function ViewportToolbar() {
  const tool = useCreatorStore((s) => s.tool);
  const setTool = useCreatorStore((s) => s.setTool);
  const frameViewport = useCreatorStore((s) => s.frameViewport);
  const resetViewport = useCreatorStore((s) => s.resetViewport);

  return (
    <div className="viewport-toolbar-left">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool-btn ${tool === t.id ? "active" : ""}`}
          title={`${t.label} — ${t.hint}`}
          onClick={() => setTool(t.id)}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}
      <div className="tool-sep" />
      <button className="tool-btn" title="Frame the selected object" onClick={frameViewport}>
        <span className="tool-icon">◎</span>
        <span className="tool-label">Frame</span>
      </button>
      <button className="tool-btn" title="Reset the camera" onClick={resetViewport}>
        <span className="tool-icon">⌂</span>
        <span className="tool-label">Home</span>
      </button>
    </div>
  );
}
