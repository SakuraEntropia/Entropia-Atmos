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
  onDragEnd: (target: DragTarget, position: [number, number, number]) => void;
}

const EMITTER_COLOR = 0xff8c42;
const EMITTER_SELECTED = 0xffc27f;
const LISTENER_COLOR = 0x4fc3f7;
const LISTENER_SELECTED = 0x9fdcff;
const WALL_COLOR = 0x3a4a5a;

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
    this.controls.mouseButtons = {
      LEFT: undefined as unknown as THREE.MOUSE,
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
          const group = new THREE.Group();
          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 24, 24),
            new THREE.MeshStandardMaterial({ color: LISTENER_COLOR, roughness: 0.4 })
          );
          group.add(head);
          for (const side of [-1, 1]) {
            const ear = new THREE.Mesh(
              new THREE.SphereGeometry(0.045, 16, 16),
              new THREE.MeshStandardMaterial({ color: LISTENER_COLOR, roughness: 0.4 })
            );
            ear.position.set(side * 0.085, 0, 0);
            group.add(ear);
          }
          const nose = new THREE.Mesh(
            new THREE.ConeGeometry(0.05, 0.14, 16),
            new THREE.MeshStandardMaterial({ color: LISTENER_COLOR, roughness: 0.4 })
          );
          nose.rotation.x = Math.PI / 2;
          nose.position.set(0, 0, 0.14);
          group.add(nose);
          applyTransform(group, transform);
          this.scene.add(group);
          this.draggables.set(`listener:${prim.id}`, { object: group, target: { type: "listener", id: prim.id }, baseColor: LISTENER_COLOR });
        }
      }
    }
  }

  highlight(selection: { type: PrimType; id: string } | null): void {
    for (const { object, target, baseColor } of this.draggables.values()) {
      const selected = selection !== null && selection.type === target.type && selection.id === target.id;
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
          (mesh.material as THREE.MeshStandardMaterial).color.setHex(
            selected ? (target.type === "emitter" ? EMITTER_SELECTED : LISTENER_SELECTED) : baseColor
          );
        }
      });
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
    const pick = this.pickObject(event);
    if (pick) {
      this.controls.enabled = false;
      this.dragging = pick;
      this.callbacks.onSelect(pick.target);
      // Camera-facing drag plane through the hit point.
      this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), pick.object.position);
      const hit = this.raycastToPlane(event);
      if (hit) this.dragOffset.copy(pick.object.position).sub(hit);
    } else {
      this.callbacks.onSelect(null);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const hit = this.raycastToPlane(event);
    if (hit) this.dragging.object.position.copy(hit.add(this.dragOffset));
  };

  private onPointerUp = (event: PointerEvent): void => {
    const wasDrag = this.dragging !== null;
    if (this.dragging) {
      const { object, target } = this.dragging;
      const position: [number, number, number] = [object.position.x, object.position.y, object.position.z];
      this.callbacks.onDragEnd(target, position);
      this.dragging = null;
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
