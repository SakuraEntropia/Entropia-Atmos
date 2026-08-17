/** DSP graph: nodes, edges, and compile-time scheduling.
 *
 * Scheduling is implemented for real: topological order with cycle detection.
 * Real-time-safe execution is a TODO for Phase 3.
 */
import type { DspNode } from "./dspNode";

export interface DspEdge {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

export interface DspPlan {
  /** Node ids in execution order (topological). */
  readonly order: readonly string[];
}

export class DspGraph {
  private readonly nodes = new Map<string, DspNode>();
  private readonly edgeList: DspEdge[] = [];

  addNode(node: DspNode): void {
    if (this.nodes.has(node.id)) throw new Error(`duplicate node id '${node.id}'`);
    this.nodes.set(node.id, node);
  }

  connect(from: DspEdge["from"], to: DspEdge["to"]): void {
    if (!this.nodes.has(from.nodeId)) throw new Error(`unknown node '${from.nodeId}'`);
    if (!this.nodes.has(to.nodeId)) throw new Error(`unknown node '${to.nodeId}'`);
    this.edgeList.push({ from, to });
  }

  /** Topologically order nodes; throws when the graph contains a cycle. */
  plan(): DspPlan {
    const indegree = new Map<string, number>();
    for (const id of this.nodes.keys()) indegree.set(id, 0);
    for (const edge of this.edgeList) {
      indegree.set(edge.to.nodeId, (indegree.get(edge.to.nodeId) ?? 0) + 1);
    }

    const ready = [...this.nodes.keys()].filter((id) => indegree.get(id) === 0);
    const order: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      for (const edge of this.edgeList) {
        if (edge.from.nodeId === id) {
          const next = indegree.get(edge.to.nodeId)! - 1;
          indegree.set(edge.to.nodeId, next);
          if (next === 0) ready.push(edge.to.nodeId);
        }
      }
    }
    if (order.length !== this.nodes.size) {
      throw new Error("DSP graph contains a cycle and cannot be scheduled");
    }
    return { order };
  }

  get size(): number {
    return this.nodes.size;
  }

  /** The graph's edges (read-only view, for inspection and execution). */
  get edges(): readonly DspEdge[] {
    return this.edgeList;
  }
}

// TODO: real-time-safe execution (lock-free queue, fixed block size, denormal
// TODO: handling); compile graphs to flat schedules with buffer reuse (Phase 3).
