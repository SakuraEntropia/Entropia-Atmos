/** React wrapper around the three.js panner viewport. */
import { useEffect, useRef } from "react";
import { PannerViewport } from "../pan/pannerViewport";
import { ViewportToolbar } from "./ViewportToolbar";
import { setTransformPosition, setTransformRotation, useCreatorStore } from "../state/sceneStore";

export function Viewport3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<PannerViewport | null>(null);
  const document = useCreatorStore((s) => s.document);
  const selection = useCreatorStore((s) => s.selection);
  const select = useCreatorStore((s) => s.select);
  const updatePayload = useCreatorStore((s) => s.updatePayload);
  const viewportReset = useCreatorStore((s) => s.viewportReset);
  const hiddenIds = useCreatorStore((s) => s.hiddenIds);
  const tool = useCreatorStore((s) => s.tool);
  const frameSignal = useCreatorStore((s) => s.frameSignal);
  const coordSpace = useCreatorStore((s) => s.coordSpace);
  const snapEnabled = useCreatorStore((s) => s.snapEnabled);
  const snapStep = useCreatorStore((s) => s.snapStep);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = new PannerViewport(canvas, {
      onSelect: (target) => select(target),
      onDragEnd: (target, position, quaternion) =>
        updatePayload(target.type, target.id, (payload) => {
          setTransformPosition(payload, position);
          setTransformRotation(payload, quaternion);
        }),
    });
    viewportRef.current = viewport;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      viewport.resize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      viewport.dispose();
      viewportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewportRef.current?.setDocument(document);
  }, [document]);

  useEffect(() => {
    viewportRef.current?.highlight(selection);
  }, [selection, document]);

  useEffect(() => {
    viewportRef.current?.resetCamera();
  }, [viewportReset]);

  useEffect(() => {
    viewportRef.current?.setHidden(hiddenIds);
  }, [hiddenIds]);

  useEffect(() => {
    viewportRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    viewportRef.current?.frameSelected();
  }, [frameSignal]);

  useEffect(() => {
    viewportRef.current?.setCoordSpace(coordSpace);
  }, [coordSpace]);

  useEffect(() => {
    viewportRef.current?.setSnap(snapEnabled, snapStep);
  }, [snapEnabled, snapStep]);

  return (
    <div className="viewport-wrap">
      <canvas ref={canvasRef} className="viewport-canvas" />
      <ViewportToolbar />
      <div className="viewport-toolbar">
        <button onClick={() => viewportRef.current?.resetCamera()}>⌂ Reset view</button>
        <span className="viewport-hint">右键拖拽旋转 · 中键平移 · 滚轮缩放 · 拖动物体摆位</span>
      </div>
    </div>
  );
}
