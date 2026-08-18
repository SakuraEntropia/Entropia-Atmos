/** Blender-style 3D panner viewport (three.js).
 *
 * Orbit / pan / zoom with the mouse (right-drag orbit, middle-drag pan,
 * wheel zoom), click to select, and drag emitters/listeners on a
 * camera-facing plane to re-position them in the scene.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AudioUsdDocumentLike, PrimType, TransformPayload } from "../state/sceneStore";

export interface DragTarget {
  type: PrimType;
  id: string;
}

export interface ViewportCallbacks {
  onSelect: (target: DragTarget | null) => void;
  /** Committed after a drag: world position + quaternion [x,y,z,w]. */
  onDragEnd: (target: DragTarget, position: [number, number, number], quaternion: [number, number, number, number]) => void;
}

const IDENTITY_QUAT = new THREE.Quaternion();

const EMITTER_COLOR = 0xff8c42;
const EMITTER_SELECTED = 0xffc27f;
const LISTENER_COLOR = 0x4fc3f7;
const LISTENER_SELECTED = 0x9fdcff;
const WALL_COLOR = 0x3a4a5a;
const GEOMETRY_COLOR = 0x8a9db0;
const GEOMETRY_EDGE = 0x5f7184;

export class PannerViewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  private readonly dragOffset = new THREE.Vector3();

  private draggables = new Map<string, { object: THREE.Object3D; target: DragTarget; baseColor: number }>();
  private dragging: { object: THREE.Object3D; target: DragTarget } | null = null;
  private downAt: { x: number; y: number } | null = null;
  private frame = 0;

  // Blender-style gizmo (translate arrows + rotate rings).
  private readonly gizmo = new THREE.Group();
  private readonly gizmoParts: { mesh: THREE.Mesh; mode: "translate" | "rotate" | "scale"; axis: THREE.Vector3 }[] = [];
  private gizmoTarget: { object: THREE.Object3D; target: DragTarget } | null = null;
  private gizmoDrag: { mode: "translate" | "rotate" | "scale"; axis: THREE.Vector3; startPos: THREE.Vector3; startQuat: THREE.Quaternion; startScale: THREE.Vector3; plane: THREE.Plane; startAngle: number; u: THREE.Vector3; v: THREE.Vector3 } | null = null;
  private selectedId: string | null = null;
  private tool: "select" | "move" | "rotate" | "scale" = "move";
  private coordSpace: "global" | "local" = "global";
  private snapEnabled = false;
  private snapStep = 0.25;

  setCoordSpace(space: "global" | "local"): void {
    this.coordSpace = space;
    this.updateGizmo();
  }

  setSnap(enabled: boolean, step: number): void {
    this.snapEnabled = enabled;
    this.snapStep = step;
  }

  /** Blender-style active tool: controls gizmo parts and object dragging. */
  setTool(tool: "select" | "move" | "rotate" | "scale"): void {
    this.tool = tool;
    this.updateGizmo();
  }

  /** Frame the selected object (camera target follows it). */
  frameSelected(): void {
    if (this.gizmoTarget) {
      this.controls.target.copy(this.gizmoTarget.object.position);
      this.controls.update();
    }
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: ViewportCallbacks
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(8, 6.5, 9);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(2.5, 2, 1.5);
    // Standard viewer scheme: left-drag orbits, middle-drag pans, wheel
    // zooms. Dragging an object (pointer down ON it) temporarily takes
    // over; clicking empty space just selects.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    this.scene.background = new THREE.Color(0x14161a);
    const grid = new THREE.GridHelper(14, 14, 0x2c3540, 0x1e242b);
    this.scene.add(grid);
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 10, 6);
    this.scene.add(key);

    this.buildGizmo();
    this.gizmo.visible = false;
    this.scene.add(this.gizmo);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.loop();
  }

  setDocument(document: AudioUsdDocumentLike | null): void {
    for (const entry of this.draggables.values()) this.scene.remove(entry.object);
    this.draggables.clear();
    if (!document) return;

    // Room shell.
    if (document.room) {
      const { min, max } = document.room;
      const size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      const box = new THREE.BoxGeometry(size.x, size.y, size.z);
      const walls = new THREE.Mesh(
        box,
        new THREE.MeshBasicMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide })
      );
      walls.position.copy(center);
      this.scene.add(walls);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(box),
        new THREE.LineBasicMaterial({ color: WALL_COLOR, transparent: true, opacity: 0.85 })
      );
      edges.position.copy(center);
      this.scene.add(edges);
      this.controls.target.copy(center);
    }

    // Re-anchor the gizmo to the recreated objects (document edits rebuild
    // the whole scene; the previous gizmoTarget referenced disposed objects).
    const gizmoEntry = this.selectedId ? this.draggables.get(this.selectedId) : null;
    this.gizmoTarget = gizmoEntry ?? null;
    this.updateGizmo();

    // Imported triangle meshes (geometry prims with inline mesh data).
    const geometryPrims = document.layers.flatMap((layer) => layer.prims).filter((p) => p.type === "geometry");
    for (const prim of geometryPrims) {
      const meshPayload = prim.payload.mesh as { positions: number[]; triangles: number[] } | undefined;
      if (!meshPayload) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(meshPayload.positions, 3));
      geometry.setIndex(meshPayload.triangles);
      geometry.computeVertexNormals();
      const object = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: GEOMETRY_COLOR, roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: GEOMETRY_EDGE, transparent: true, opacity: 0.9 })
      );
      object.add(edges);
      applyTransform(object, transformOf(prim.payload));
      this.scene.add(object);
      this.draggables.set(`geometry:${prim.id}`, { object, target: { type: "geometry", id: prim.id }, baseColor: GEOMETRY_COLOR });
    }

    for (const layer of document.layers) {
      for (const prim of layer.prims) {
        const transform = transformOf(prim.payload);
        if (prim.type === "emitter") {
          const object = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 24, 24),
            new THREE.MeshStandardMaterial({ color: EMITTER_COLOR, roughness: 0.35, metalness: 0.1 })
          );
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.24, 0.012, 12, 40),
            new THREE.MeshBasicMaterial({ color: EMITTER_COLOR, transparent: true, opacity: 0.8 })
          );
          ring.rotation.x = Math.PI / 2;
          object.add(ring);
          applyTransform(object, transform);
          this.scene.add(object);
          this.draggables.set(`emitter:${prim.id}`, { object, target: { type: "emitter", id: prim.id }, baseColor: EMITTER_COLOR });
        } else if (prim.type === "listener") {
          // Camera-style representation (like 3D software): body box + view
          // frustum wireframe showing the binaural listening direction.
          const group = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.1, 0.18),
            new THREE.MeshStandardMaterial({ color: LISTENER_COLOR, roughness: 0.35 })
          );
          group.add(body);
          const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16),
            new THREE.MeshStandardMaterial({ color: 0x274156, roughness: 0.5 })
          );
          lens.rotation.x = Math.PI / 2;
          lens.position.set(0, 0, 0.14);
          group.add(lens);
          // Frustum: apex behind the body, opening forward (+z), ~60° FOV.
          const fov = 1.0; // half-angle tangent
          const nearZ = 0.12;
          const farZ = 1.1;
          const apex = new THREE.Vector3(0, 0, -0.05);
          const nw = new THREE.Vector3(-fov * nearZ, fov * nearZ * 0.75, nearZ);
          const ne = new THREE.Vector3(fov * nearZ, fov * nearZ * 0.75, nearZ);
          const se = new THREE.Vector3(fov * nearZ, -fov * nearZ * 0.75, nearZ);
          const sw = new THREE.Vector3(-fov * nearZ, -fov * nearZ * 0.75, nearZ);
          const fw = new THREE.Vector3(-fov * farZ, fov * farZ * 0.75, farZ);
          const fe = new THREE.Vector3(fov * farZ, fov * farZ * 0.75, farZ);
          const fe2 = new THREE.Vector3(fov * farZ, -fov * farZ * 0.75, farZ);
          const fsw = new THREE.Vector3(-fov * farZ, -fov * farZ * 0.75, farZ);
          const points = [apex, nw, apex, ne, apex, se, apex, sw, nw, ne, ne, se, se, sw, sw, nw, fw, fe, fe, fe2, fe2, fsw, fsw, fw, nw, fw, ne, fe, se, fe2, sw, fsw];
          const frustum = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: LISTENER_COLOR, transparent: true, opacity: 0.9 })
          );
          frustum.renderOrder = 2;
          group.add(frustum);
          applyTransform(group, transform);
          this.scene.add(group);
          this.draggables.set(`listener:${prim.id}`, { object: group, target: { type: "listener", id: prim.id }, baseColor: LISTENER_COLOR });
        }
      }
    }
  }

  setHidden(hiddenIds: string[]): void {
    for (const [key, entry] of this.draggables) {
      const id = key.split(":")[1];
      entry.object.visible = !hiddenIds.includes(id);
    }
    this.updateGizmo();
  }

  highlight(selection: { type: PrimType; id: string } | null): void {
    for (const { object, target, baseColor } of this.draggables.values()) {
      const selected = selection !== null && selection.type === target.type && selection.id === target.id;
      const selectedColor =
        target.type === "emitter" ? EMITTER_SELECTED
        : target.type === "listener" ? LISTENER_SELECTED
        : 0x9db3c8;
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
          (mesh.material as THREE.MeshStandardMaterial).color.setHex(selected ? selectedColor : baseColor);
        }
      });
    }
    // Attach the Blender-style gizmo to the selected object.
    const key = selection ? `${selection.type}:${selection.id}` : null;
    if (key !== this.selectedId) {
      this.selectedId = key;
      const entry = key ? this.draggables.get(key) : null;
      this.gizmoTarget = entry ?? null;
      this.updateGizmo();
    }
  }

  resetCamera(): void {
    this.camera.position.set(8, 6.5, 9);
    this.controls.target.set(2.5, 2, 1.5);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.controls.dispose();
    this.renderer.dispose();
  }

  private buildGizmo(): void {
    const axes: { name: "x" | "y" | "z"; color: number; axis: THREE.Vector3; shaftRot: THREE.Euler; ringRot: THREE.Euler }[] = [
      { name: "x", color: 0xff5252, axis: new THREE.Vector3(1, 0, 0), shaftRot: new THREE.Euler(0, 0, -Math.PI / 2), ringRot: new THREE.Euler(0, Math.PI / 2, 0) },
      { name: "y", color: 0x52d052, axis: new THREE.Vector3(0, 1, 0), shaftRot: new THREE.Euler(0, 0, 0), ringRot: new THREE.Euler(Math.PI / 2, 0, 0) },
      { name: "z", color: 0x4d8dff, axis: new THREE.Vector3(0, 0, 1), shaftRot: new THREE.Euler(Math.PI / 2, 0, 0), ringRot: new THREE.Euler(0, 0, 0) },
    ];
    for (const { color, axis, shaftRot, ringRot } of axes) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
      );
      cube.position.copy(axis).multiplyScalar(0.95);
      cube.renderOrder = 999;
      this.gizmo.add(cube);
      this.gizmoParts.push({ mesh: cube, mode: "scale", axis });

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.8, 12),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
      );
      shaft.rotation.copy(shaftRot);
      shaft.position.copy(axis).multiplyScalar(0.4);
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.2, 16),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
      );
      tip.rotation.copy(shaftRot);
      tip.position.copy(axis).multiplyScalar(0.95);
      shaft.renderOrder = 999;
      tip.renderOrder = 999;
      this.gizmo.add(shaft, tip);
      this.gizmoParts.push({ mesh: shaft, mode: "translate", axis });
      this.gizmoParts.push({ mesh: tip, mode: "translate", axis });

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.022, 12, 48),
        new THREE.MeshBasicMaterial({ color, depthTest: false })
      );
      ring.rotation.copy(ringRot);
      ring.renderOrder = 999;
      this.gizmo.add(ring);
      this.gizmoParts.push({ mesh: ring, mode: "rotate", axis });
    }
  }

  /** Attach the gizmo to the selected object (Blender-style overlay). */
  private updateGizmo(): void {
    const entry = this.gizmoTarget;
    if (!entry || !this.draggables.has(`${entry.target.type}:${entry.target.id}`)) {
      this.gizmo.visible = false;
      this.gizmoTarget = null;
      return;
    }
    this.gizmo.visible = entry.object.visible && this.tool !== "select";
    for (const part of this.gizmoParts) {
      part.mesh.visible =
        this.tool === "rotate" ? part.mode === "rotate"
        : this.tool === "scale" ? part.mode === "scale"
        : part.mode === "translate";
    }
    // Local coordinate system rotates the gizmo with the object.
    this.gizmo.quaternion.copy(this.coordSpace === "local" ? entry.object.quaternion : IDENTITY_QUAT);
    this.gizmo.position.copy(entry.object.position);
    const cameraDistance = this.camera.position.distanceTo(entry.object.position);
    const scale = Math.max(0.35, Math.min(2.5, cameraDistance * 0.18));
    this.gizmo.scale.setScalar(scale);
  }

  private pickGizmo(event: PointerEvent): { mode: "translate" | "rotate" | "scale"; axis: THREE.Vector3 } | null {
    if (!this.gizmo.visible) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.gizmoParts.map((p) => p.mesh), false);
    if (hits.length === 0) return null;
    const mesh = hits[0].object as THREE.Mesh;
    const part = this.gizmoParts.find((p) => p.mesh === mesh);
    if (!part) return null;
    const axis = this.coordSpace === "local" && this.gizmoTarget
      ? part.axis.clone().applyQuaternion(this.gizmoTarget.object.quaternion).normalize()
      : part.axis.clone();
    return { mode: part.mode, axis };
  }

  private rayToPointerPlane(event: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }

  // --- interaction ------------------------------------------------------------

  private pickObject(event: PointerEvent): { object: THREE.Object3D; target: DragTarget } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.draggables.values()].map((d) => d.object), true);
    if (hits.length === 0) return null;
    const hitObject = hits[0].object;
    for (const entry of this.draggables.values()) {
      if (hitObject === entry.object || entry.object.getObjectById(hitObject.id) !== undefined || isDescendant(hitObject, entry.object)) {
        return entry;
      }
    }
    return null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY };
    // 1) Gizmo handles win (translate axis / rotate ring / scale axis).
    const gizmoPart = this.pickGizmo(event);
    if (gizmoPart && this.gizmoTarget && this.tool !== "select") {
      this.controls.enabled = false;
      this.dragging = null;
      const entry = this.gizmoTarget;
      const { axis } = gizmoPart;
      if (gizmoPart.mode === "scale") {
        const cameraDir = this.camera.getWorldDirection(new THREE.Vector3());
        let normal = new THREE.Vector3().crossVectors(axis, cameraDir);
        if (normal.lengthSq() < 1e-6) normal = cameraDir.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, entry.object.position);
        this.gizmoDrag = {
          mode: "scale", axis, startPos: entry.object.position.clone(), startQuat: entry.object.quaternion.clone(),
          startScale: entry.object.scale.clone(), plane, startAngle: 0, u: new THREE.Vector3(), v: new THREE.Vector3(),
        };
      } else if (gizmoPart.mode === "translate") {
        const cameraDir = this.camera.getWorldDirection(new THREE.Vector3());
        let normal = new THREE.Vector3().crossVectors(axis, cameraDir);
        if (normal.lengthSq() < 1e-6) normal = cameraDir.clone();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, entry.object.position);
        this.gizmoDrag = {
          mode: "translate", axis, startPos: entry.object.position.clone(), startQuat: entry.object.quaternion.clone(),
          startScale: entry.object.scale.clone(), plane, startAngle: 0, u: new THREE.Vector3(), v: new THREE.Vector3(),
        };
      } else {
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, entry.object.position);
        const u = new THREE.Vector3().crossVectors(axis, this.camera.position.clone().sub(entry.object.position)).normalize();
        if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
        const v = new THREE.Vector3().crossVectors(axis, u).normalize();
        const hit = this.rayToPointerPlane(event, plane);
        const startAngle = hit ? Math.atan2(v.dot(hit.clone().sub(entry.object.position)), u.dot(hit.clone().sub(entry.object.position))) : 0;
        this.gizmoDrag = { mode: "rotate", axis, startPos: entry.object.position.clone(), startQuat: entry.object.quaternion.clone(), startScale: entry.object.scale.clone(), plane, startAngle, u, v };
      }
      return;
    }
    // 2) Scene objects: free-drag only with the Move tool; otherwise click
    // selects (Blender-like tool semantics).
    const pick = this.pickObject(event);
    if (pick && this.tool === "move") {
      this.controls.enabled = false;
      this.dragging = pick;
      this.callbacks.onSelect(pick.target);
      // Camera-facing drag plane through the hit point.
      this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), pick.object.position);
      const hit = this.raycastToPlane(event);
      if (hit) this.dragOffset.copy(pick.object.position).sub(hit);
    } else {
      if (pick) this.callbacks.onSelect(pick.target);
      else this.callbacks.onSelect(null);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.gizmoDrag && this.gizmoTarget) {
      const drag = this.gizmoDrag;
      const hit = this.rayToPointerPlane(event, drag.plane);
      if (!hit) return;
      if (drag.mode === "translate") {
        let s = new THREE.Vector3().subVectors(hit, drag.startPos).dot(drag.axis);
        if (this.snapEnabled) s = Math.round(s / this.snapStep) * this.snapStep;
        this.gizmoTarget.object.position.copy(drag.startPos).addScaledVector(drag.axis, s);
      } else if (drag.mode === "scale") {
        const s = new THREE.Vector3().subVectors(hit, drag.startPos).dot(drag.axis);
        // Factor = drag distance / initial handle distance (correct Blender
        // semantics), snapped to 0.1 steps when snapping is enabled.
        const handleDistance = Math.max(0.1, this.gizmo.scale.x * 0.95);
        let factor = Math.max(0.01, 1 + s / handleDistance);
        if (this.snapEnabled) factor = Math.max(0.01, Math.round(factor * 10) / 10);
        const scaled = drag.startScale.clone();
        if (Math.abs(drag.axis.x) > 0.5) scaled.x *= factor;
        else if (Math.abs(drag.axis.y) > 0.5) scaled.y *= factor;
        else scaled.z *= factor;
        this.gizmoTarget.object.scale.copy(scaled);
      } else {
        const rel = new THREE.Vector3().subVectors(hit, drag.startPos);
        let angle = Math.atan2(drag.v.dot(rel), drag.u.dot(rel)) - drag.startAngle;
        if (this.snapEnabled) angle = Math.round(angle / (Math.PI / 36)) * (Math.PI / 36); // 5° steps
        const delta = new THREE.Quaternion().setFromAxisAngle(drag.axis, angle);
        this.gizmoTarget.object.quaternion.copy(delta.multiply(drag.startQuat));
      }
      this.updateGizmo();
      return;
    }
    if (!this.dragging) return;
    const hit = this.raycastToPlane(event);
    if (hit) {
      this.dragging.object.position.copy(hit.add(this.dragOffset));
      this.updateGizmo();
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    const wasDrag = this.dragging !== null || this.gizmoDrag !== null;
    if (this.dragging) {
      const { object, target } = this.dragging;
      const position: [number, number, number] = [object.position.x, object.position.y, object.position.z];
      this.callbacks.onDragEnd(target, position, [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w]);
      this.dragging = null;
    }
    if (this.gizmoDrag && this.gizmoTarget) {
      const { object, target } = this.gizmoTarget;
      this.callbacks.onDragEnd(target, [object.position.x, object.position.y, object.position.z], [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w]);
      this.gizmoDrag = null;
    }
    this.controls.enabled = true;
    // A pure click (no movement) on empty space keeps the selection cleared;
    // small-movement tolerance avoids accidental clears after orbit.
    if (!wasDrag && this.downAt && Math.abs(event.clientX - this.downAt.x) < 4 && Math.abs(event.clientY - this.downAt.y) < 4) {
      this.callbacks.onSelect(null);
    }
    this.downAt = null;
  };

  private raycastToPlane(event: PointerEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.dragPlane, hit) ? hit : null;
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.controls.update();
    this.updateGizmo();
    this.renderer.render(this.scene, this.camera);
  };
}

function isDescendant(child: THREE.Object3D, parent: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = child;
  while (node) {
    if (node === parent) return true;
    node = node.parent;
  }
  return false;
}

function applyTransform(object: THREE.Object3D, transform: TransformPayload): void {
  object.position.set(transform.position[0], transform.position[1], transform.position[2]);
  object.quaternion.set(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
  object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
}

function transformOf(payload: Record<string, unknown>): TransformPayload {
  const t = (payload.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }) as Record<string, unknown>;
  return {
    position: (t.position as [number, number, number]) ?? [0, 0, 0],
    rotation: (t.rotation as [number, number, number, number]) ?? [0, 0, 0, 1],
    scale: (t.scale as [number, number, number]) ?? [1, 1, 1],
  };
}
