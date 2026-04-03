import { ChannelKind } from "../core/types.js";

export type DependencyState =
  | "unknown"
  | "starting"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "recovering"
  | "quarantined";

export interface DependencyProbeResult {
  state: DependencyState;
  detail?: string;
}

export interface DependencyStatus {
  id: string;
  label: string;
  state: DependencyState;
  detail?: string;
  channel?: ChannelKind;
  required: boolean;
  checkedAt: string;
  checkedAtMs: number;
}

export interface DependencyProbe {
  id: string;
  label: string;
  channel?: ChannelKind;
  required?: boolean;
  run: () => Promise<DependencyProbeResult>;
}

export interface RuntimeHealthSnapshot {
  ok: boolean;
  ready: boolean;
  checkedAt: string;
  checkedAtMs: number;
  dependencies: DependencyStatus[];
  reasons: string[];
}

export interface RuntimeHealthReporter {
  start(): Promise<void>;
  stop(): Promise<void>;
  refresh(): Promise<RuntimeHealthSnapshot>;
  healthz(): { ok: boolean; checkedAt: string; checkedAtMs: number };
  readyz(): RuntimeHealthSnapshot;
  isChannelHealthy(channel: ChannelKind): boolean;
  channelReason(channel: ChannelKind): string | undefined;
}
