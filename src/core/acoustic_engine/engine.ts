/** Default AcousticEngine wiring: solver registry → early paths, FDN reverb
 * → late field, combined into one directional impulse response. */
import type { DirectionalImpulseResponse, LateField } from "./impulseResponse";
import type { GeometryProcessor } from "./geometryProcessor";
import type { RayTracer } from "./rayTracer";
import type { AcousticEngine, SimulationRequest, Solver, SolverRegistry } from "./acousticEngine";
import type { ReverbRequest, ReverbSystem } from "./reverbSystem";

export class MapSolverRegistry implements SolverRegistry {
  private readonly solvers = new Map<string, Solver>();

  register(solver: Solver): void {
    if (this.solvers.has(solver.id)) throw new Error(`solver '${solver.id}' is already registered`);
    this.solvers.set(solver.id, solver);
  }

  resolve(id: string): Solver | undefined {
    return this.solvers.get(id);
  }

  list(): readonly Solver[] {
    return [...this.solvers.values()];
  }
}

export interface DefaultAcousticEngineOptions {
  geometry?: GeometryProcessor;
  rayTracer?: RayTracer;
  reverb: ReverbSystem;
  solvers?: readonly Solver[];
}

export class DefaultAcousticEngine implements AcousticEngine {
  readonly geometry?: GeometryProcessor;
  readonly rayTracer?: RayTracer;
  readonly reverb: ReverbSystem;
  readonly solvers: SolverRegistry;

  constructor(options: DefaultAcousticEngineOptions) {
    this.geometry = options.geometry;
    this.rayTracer = options.rayTracer;
    this.reverb = options.reverb;
    this.solvers = new MapSolverRegistry();
    for (const solver of options.solvers ?? []) this.solvers.register(solver);
  }

  async simulate(request: SimulationRequest): Promise<DirectionalImpulseResponse> {
    const solver = this.solvers.resolve(request.options.solver);
    if (!solver) {
      const known = this.solvers.list().map((s) => s.id).join(", ") || "(none)";
      throw new Error(`unknown solver '${request.options.solver}' (registered: ${known})`);
    }

    const early = await solver.simulate(request);

    const reverbRequest: ReverbRequest = {
      scene: request.scene,
      emitterId: request.emitterId,
      listenerId: request.listenerId,
      durationSeconds: request.options.lateFieldDurationSeconds ?? 1.5,
      sampleRate: request.options.sampleRate,
    };
    // Solver that already encode propagation (splat fields) disable the
    // statistical late field with lateFieldDurationSeconds: 0.
    let late: LateField = { bands: [], samples: new Float32Array(0) };
    let lateDuration = 0;
    if (reverbRequest.durationSeconds > 0) {
      const estimate = await this.reverb.estimateLateField(reverbRequest);
      const stereo = await this.reverb.synthesize(reverbRequest, estimate);
      late = { ...estimate, samples: stereo.left, stereo };
      lateDuration = reverbRequest.durationSeconds;
    }

    return {
      sampleRate: request.options.sampleRate,
      durationSeconds: Math.max(lateDuration, early.durationSeconds),
      early: early.early,
      late,
    };
  }
}
