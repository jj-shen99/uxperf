/**
 * E-83: Pluggable Engine Adapter Protocol
 *
 * Defines a formal typed interface for all engine adapters and a
 * type-safe adapter registry with validation and lifecycle hooks.
 */
import type { EngineRunRequest, EngineRunResult } from "./types";

// ── Adapter metadata ─────────────────────────────────────────

export interface EngineAdapterMetadata {
  /** Unique engine name (e.g., "playwright-lighthouse") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description of what the adapter does */
  description: string;
  /** Supported device modes */
  supportedDevices: ("desktop" | "mobile")[];
  /** Whether this adapter supports load (concurrent VU) testing */
  supportsLoadTesting: boolean;
  /** Whether this adapter produces Lighthouse scores */
  producesLighthouseScores: boolean;
  /** Required environment variables */
  requiredEnvVars: string[];
  /** Optional environment variables */
  optionalEnvVars: string[];
}

// ── Adapter interface ────────────────────────────────────────

export interface EngineAdapter {
  /** Metadata describing the adapter's capabilities */
  readonly metadata: EngineAdapterMetadata;

  /**
   * Execute a performance test run.
   * @param request - The run configuration
   * @returns The aggregated results
   */
  run(request: EngineRunRequest): Promise<EngineRunResult>;

  /**
   * Check whether this adapter is available (dependencies installed, env configured).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Optional: called once when the adapter is registered.
   * Use for one-time setup like verifying binary paths.
   */
  onRegister?(): void | Promise<void>;

  /**
   * Optional: called when the adapter is being removed or the process is shutting down.
   */
  onDestroy?(): void | Promise<void>;

  /**
   * Optional: validate a request before executing.
   * Throw an Error with a descriptive message if the request is invalid for this adapter.
   */
  validateRequest?(request: EngineRunRequest): void;
}

// ── Adapter registry ─────────────────────────────────────────

export class EngineAdapterRegistry {
  private adapters = new Map<string, EngineAdapter>();

  /**
   * Register an adapter. Calls onRegister() if defined.
   * @throws if an adapter with the same name is already registered
   */
  async register(adapter: EngineAdapter): Promise<void> {
    const name = adapter.metadata.name;
    if (this.adapters.has(name)) {
      throw new Error(`Engine adapter "${name}" is already registered`);
    }
    if (adapter.onRegister) {
      await adapter.onRegister();
    }
    this.adapters.set(name, adapter);
  }

  /** Unregister an adapter by name. Calls onDestroy() if defined. */
  async unregister(name: string): Promise<boolean> {
    const adapter = this.adapters.get(name);
    if (!adapter) return false;
    if (adapter.onDestroy) {
      await adapter.onDestroy();
    }
    return this.adapters.delete(name);
  }

  /** Get a registered adapter by name. */
  get(name: string): EngineAdapter | undefined {
    return this.adapters.get(name);
  }

  /** List all registered adapters. */
  list(): EngineAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** List adapter metadata without exposing the full adapter objects. */
  listMetadata(): EngineAdapterMetadata[] {
    return this.list().map((a) => a.metadata);
  }

  /** List only adapters whose isAvailable() returns true. */
  async listAvailable(): Promise<EngineAdapter[]> {
    const results = await Promise.all(
      this.list().map(async (a) => ({
        adapter: a,
        available: await a.isAvailable().catch(() => false),
      })),
    );
    return results.filter((r) => r.available).map((r) => r.adapter);
  }

  /**
   * Resolve the best adapter for a request.
   * Priority: explicit engine name > first available.
   */
  async resolve(
    request: EngineRunRequest & { engine?: string },
  ): Promise<EngineAdapter> {
    if (request.engine) {
      const adapter = this.get(request.engine);
      if (!adapter) {
        throw new Error(
          `Engine "${request.engine}" not registered. Available: ${this.list().map((a) => a.metadata.name).join(", ")}`,
        );
      }
      const available = await adapter.isAvailable();
      if (!available) {
        throw new Error(
          `Engine "${request.engine}" is registered but not available. Check: ${adapter.metadata.requiredEnvVars.join(", ") || "no env vars required"}`,
        );
      }
      if (adapter.validateRequest) {
        adapter.validateRequest(request);
      }
      return adapter;
    }

    const available = await this.listAvailable();
    if (available.length === 0) {
      throw new Error(
        `No engine adapters available. Registered: ${this.list().map((a) => a.metadata.name).join(", ") || "none"}`,
      );
    }

    const adapter = available[0];
    if (adapter.validateRequest) {
      adapter.validateRequest(request);
    }
    return adapter;
  }

  /** Destroy all adapters and clear the registry. */
  async destroyAll(): Promise<void> {
    for (const [name] of this.adapters) {
      await this.unregister(name);
    }
  }
}

/** Global adapter registry singleton. */
export const adapterRegistry = new EngineAdapterRegistry();
