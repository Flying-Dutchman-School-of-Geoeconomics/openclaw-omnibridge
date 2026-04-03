import { ChannelKind } from "../core/types.js";
import {
  DependencyProbe,
  DependencyState,
  DependencyStatus,
  RuntimeHealthReporter,
  RuntimeHealthSnapshot,
} from "./types.js";

export interface RuntimeHealthMonitorOptions {
  probes: DependencyProbe[];
  channelDependencies?: Partial<Record<ChannelKind, string[]>>;
  refreshIntervalMs?: number;
}

const GOOD_STATES: DependencyState[] = ["healthy"];

const nowStatus = (probe: DependencyProbe, state: DependencyState, detail?: string): DependencyStatus => {
  const checkedAtMs = Date.now();
  return {
    id: probe.id,
    label: probe.label,
    state,
    detail,
    channel: probe.channel,
    required: probe.required ?? true,
    checkedAt: new Date(checkedAtMs).toISOString(),
    checkedAtMs,
  };
};

export class RuntimeHealthMonitor implements RuntimeHealthReporter {
  private readonly statuses = new Map<string, DependencyStatus>();
  private readonly channelDependencies: Partial<Record<ChannelKind, string[]>>;
  private readonly refreshIntervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastCheckedAtMs = 0;

  constructor(private readonly options: RuntimeHealthMonitorOptions) {
    this.channelDependencies = options.channelDependencies ?? {};
    this.refreshIntervalMs = options.refreshIntervalMs ?? 5000;

    for (const probe of options.probes) {
      this.statuses.set(probe.id, nowStatus(probe, "unknown", "probe not yet run"));
    }
  }

  async start(): Promise<void> {
    await this.refresh();
    if (!this.intervalHandle && this.refreshIntervalMs > 0) {
      this.intervalHandle = setInterval(() => {
        void this.refresh();
      }, this.refreshIntervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async refresh(): Promise<RuntimeHealthSnapshot> {
    const results = await Promise.all(
      this.options.probes.map(async (probe) => {
        try {
          const result = await probe.run();
          return nowStatus(probe, result.state, result.detail);
        } catch (error) {
          return nowStatus(probe, "unavailable", error instanceof Error ? error.message : String(error));
        }
      }),
    );

    for (const result of results) {
      this.statuses.set(result.id, result);
      this.lastCheckedAtMs = Math.max(this.lastCheckedAtMs, result.checkedAtMs);
    }

    return this.readyz();
  }

  healthz(): { ok: boolean; checkedAt: string; checkedAtMs: number } {
    const checkedAtMs = this.lastCheckedAtMs || Date.now();
    return {
      ok: true,
      checkedAt: new Date(checkedAtMs).toISOString(),
      checkedAtMs,
    };
  }

  readyz(): RuntimeHealthSnapshot {
    const dependencies = [...this.statuses.values()].sort((a, b) => a.id.localeCompare(b.id));
    const failing = dependencies.filter((dependency) => dependency.required && !GOOD_STATES.includes(dependency.state));
    const checkedAtMs = this.lastCheckedAtMs || Date.now();

    return {
      ok: failing.length === 0,
      ready: failing.length === 0,
      checkedAt: new Date(checkedAtMs).toISOString(),
      checkedAtMs,
      dependencies,
      reasons: failing.map((dependency) => this.formatReason(dependency)),
    };
  }

  isChannelHealthy(channel: ChannelKind): boolean {
    const dependencyIds = this.channelDependencies[channel];
    if (!dependencyIds || dependencyIds.length === 0) {
      return true;
    }

    return dependencyIds.every((dependencyId) => {
      const dependency = this.statuses.get(dependencyId);
      return dependency !== undefined && GOOD_STATES.includes(dependency.state);
    });
  }

  channelReason(channel: ChannelKind): string | undefined {
    const dependencyIds = this.channelDependencies[channel];
    if (!dependencyIds || dependencyIds.length === 0) {
      return undefined;
    }

    const failing = dependencyIds
      .map((dependencyId) => this.statuses.get(dependencyId))
      .filter((dependency): dependency is DependencyStatus => dependency !== undefined && !GOOD_STATES.includes(dependency.state));

    if (failing.length === 0) {
      return undefined;
    }

    return failing.map((dependency) => this.formatReason(dependency)).join("; ");
  }

  private formatReason(dependency: DependencyStatus): string {
    return dependency.detail ? `${dependency.label}: ${dependency.detail}` : `${dependency.label}: ${dependency.state}`;
  }
}
