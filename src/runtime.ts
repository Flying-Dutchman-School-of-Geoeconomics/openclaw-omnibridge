import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "redis";
import { DiscordAdapter } from "./channels/discord/adapter.js";
import { EmailAdapter } from "./channels/email/adapter.js";
import { SignalAdapter } from "./channels/signal/adapter.js";
import { SlackAdapter } from "./channels/slack/adapter.js";
import { StatusAdapter } from "./channels/status/adapter.js";
import { StatusWakuClient } from "./channels/status/waku-client.js";
import { TelegramAdapter } from "./channels/telegram/adapter.js";
import { WhatsAppAdapter } from "./channels/whatsapp/adapter.js";
import { CommonKnowledgeService } from "./common-knowledge/service.js";
import { StatusHumanIngressShim } from "./common-knowledge/status-human-ingress-shim.js";
import { StatusLocalIngressService } from "./common-knowledge/status-local-ingress.js";
import { FileAuditLog } from "./core/audit-log.js";
import { loadConfigFromEnv, RuntimeConfig, validateCriticalConfig } from "./core/config.js";
import { BridgeEngine } from "./core/bridge-engine.js";
import { InMemoryIdempotencyStore, InMemoryReplayStore, SlidingWindowRateLimiter } from "./core/memory-stores.js";
import { ConsoleOpenClawGateway } from "./core/openclaw-gateway.js";
import { PolicyEngine } from "./core/policy-engine.js";
import { IdempotencyStore, RateLimiter, ReplayStore } from "./core/types.js";
import {
  RedisIdempotencyStore,
  RedisKvClient,
  RedisReplayStore,
  RedisSlidingWindowRateLimiter,
} from "./core/redis-stores.js";
import { RuntimeHealthMonitor } from "./reliability/runtime-health.js";
import { RuntimeHealthReporter } from "./reliability/types.js";

export interface AdapterRegistry {
  status?: StatusAdapter;
  telegram?: TelegramAdapter;
  whatsapp?: WhatsAppAdapter;
  signal?: SignalAdapter;
  discord?: DiscordAdapter;
  slack?: SlackAdapter;
  email?: EmailAdapter;
}

export interface BridgeRuntime {
  config: RuntimeConfig;
  adapters: AdapterRegistry;
  commonKnowledge: CommonKnowledgeService;
  health: RuntimeHealthReporter;
  statusHumanIngressShim?: StatusHumanIngressShim;
  statusLocalIngress?: StatusLocalIngressService;
  start(): Promise<void>;
  stop(): Promise<void>;
}

type RedisClient = ReturnType<typeof createClient>;

class BridgeRuntimeImpl implements BridgeRuntime {
  private started = false;

  constructor(
    public readonly config: RuntimeConfig,
    public readonly adapters: AdapterRegistry,
    public readonly commonKnowledge: CommonKnowledgeService,
    public readonly health: RuntimeHealthReporter,
    public readonly statusHumanIngressShim: StatusHumanIngressShim | undefined,
    public readonly statusLocalIngress: StatusLocalIngressService | undefined,
    private readonly engine: BridgeEngine,
    private readonly cleanups: Array<() => Promise<void>>,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.engine.start();
    await this.health.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.health.stop();
    await this.engine.stop();

    for (const cleanup of this.cleanups) {
      await cleanup();
    }
    this.started = false;
  }
}

const ensureAuditDir = async (auditLogPath: string): Promise<void> => {
  const dir = path.dirname(auditLogPath);
  await mkdir(dir, { recursive: true });
};

const probeWritableAuditPath = async (auditLogPath: string): Promise<{ state: "healthy" | "unavailable"; detail: string }> => {
  const dir = path.dirname(auditLogPath);
  await access(dir, constants.W_OK);

  try {
    await access(auditLogPath, constants.W_OK);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    state: "healthy",
    detail: "audit path writable",
  };
};

const probePolicyPath = async (policyPath: string): Promise<{ state: "healthy"; detail: string }> => {
  if (!policyPath) {
    return {
      state: "healthy",
      detail: "default policy loaded",
    };
  }

  await access(policyPath, constants.R_OK);
  return {
    state: "healthy",
    detail: "policy path readable",
  };
};

const createHealthMonitor = (
  config: RuntimeConfig,
  adapters: AdapterRegistry,
  redisClientRef: { current: RedisClient | null },
): RuntimeHealthReporter => {
  const sharedDependencies = ["bootstrap.policy", "filesystem.audit"];
  if (config.storeBackend === "redis") {
    sharedDependencies.push("storage.redis");
  }

  return new RuntimeHealthMonitor({
    channelDependencies: {
      status: config.status.enabled ? [...sharedDependencies, "channel.status.waku"] : [],
      signal: config.signal.enabled ? [...sharedDependencies, "channel.signal.rpc"] : [],
      telegram: config.telegram.enabled ? [...sharedDependencies] : [],
      whatsapp: config.whatsapp.enabled ? [...sharedDependencies] : [],
      discord: config.discord.enabled ? [...sharedDependencies] : [],
      slack: config.slack.enabled ? [...sharedDependencies] : [],
      email: config.email.enabled ? [...sharedDependencies] : [],
    },
    probes: [
      {
        id: "bootstrap.policy",
        label: "policy bootstrap",
        run: async () => probePolicyPath(config.policyPath),
      },
      {
        id: "filesystem.audit",
        label: "audit filesystem",
        run: async () => probeWritableAuditPath(config.auditLogPath),
      },
      {
        id: "storage.redis",
        label: "Redis store",
        required: config.storeBackend === "redis",
        run: async () => {
          if (config.storeBackend !== "redis") {
            return {
              state: "healthy" as const,
              detail: "in-memory store backend",
            };
          }

          const redisClient = redisClientRef.current;
          if (!redisClient?.isOpen) {
            return {
              state: "unavailable" as const,
              detail: "redis client not connected",
            };
          }

          await redisClient.ping();
          return {
            state: "healthy" as const,
            detail: "redis responded to PING",
          };
        },
      },
      {
        id: "channel.signal.rpc",
        label: "Signal RPC",
        channel: "signal",
        required: config.signal.enabled,
        run: async () => {
          if (!config.signal.enabled) {
            return {
              state: "healthy" as const,
              detail: "Signal channel disabled",
            };
          }

          if (!config.signal.rpcUrl) {
            return {
              state: "unavailable" as const,
              detail: "SIGNAL_RPC_URL missing",
            };
          }

          if (!adapters.signal) {
            return {
              state: "unavailable" as const,
              detail: "Signal adapter not initialized",
            };
          }

          return adapters.signal.probeDeliverySurface();
        },
      },
      {
        id: "channel.status.waku",
        label: "Status Waku",
        channel: "status",
        required: config.status.enabled,
        run: async () => {
          if (!config.status.enabled) {
            return {
              state: "healthy" as const,
              detail: "Status channel disabled",
            };
          }

          if (!config.status.bootstrapNodes.length) {
            return {
              state: "unavailable" as const,
              detail: "STATUS_WAKU_BOOTSTRAP_NODES missing",
            };
          }

          if (!adapters.status) {
            return {
              state: "unavailable" as const,
              detail: "Status adapter not initialized",
            };
          }

          const transport = adapters.status.probeTransportHealth();
          return {
            state: transport.state,
            detail: transport.detail,
          };
        },
      },
    ],
  });
};

export const createBridgeRuntime = async (env: NodeJS.ProcessEnv): Promise<BridgeRuntime> => {
  const config = loadConfigFromEnv(env);
  validateCriticalConfig(config);

  await ensureAuditDir(config.auditLogPath);

  const gateway = new ConsoleOpenClawGateway();
  const policy = new PolicyEngine(config.policy);
  const auditLog = new FileAuditLog(config.auditLogPath);
  const cleanups: Array<() => Promise<void>> = [];
  const adapters: AdapterRegistry = {};
  const redisClientRef: { current: RedisClient | null } = { current: null };
  const health = createHealthMonitor(config, adapters, redisClientRef);
  const commonKnowledge = new CommonKnowledgeService({
    policy: config.policy,
    statusPrivateKeyHex: config.status.enabled ? config.status.privateKeyHex || undefined : undefined,
    isChannelEnabled: (channel) => Boolean(adapters[channel]),
    isChannelHealthy: (channel) => Boolean(adapters[channel]) && health.isChannelHealthy(channel),
    channelHealthReason: (channel) => health.channelReason(channel),
  });

  let resolvedIdempotencyStore: IdempotencyStore;
  let resolvedReplayStore: ReplayStore;
  let resolvedRateLimiter: RateLimiter;

  if (config.storeBackend === "redis") {
    const redis = createClient({
      url: config.redisUrl,
    });
    await redis.connect();
    redisClientRef.current = redis;
    const kvClient = redis as unknown as RedisKvClient;
    cleanups.push(async () => {
      if (redis.isOpen) {
        await redis.quit();
      }
    });

    resolvedIdempotencyStore = new RedisIdempotencyStore(
      kvClient,
      config.redisKeyPrefix,
      config.idempotencyTtlMs,
    );
    resolvedReplayStore = new RedisReplayStore(kvClient, config.redisKeyPrefix);
    resolvedRateLimiter = new RedisSlidingWindowRateLimiter(
      kvClient,
      config.redisKeyPrefix,
      config.rateLimitPerMinute,
    );
  } else {
    resolvedIdempotencyStore = new InMemoryIdempotencyStore();
    resolvedReplayStore = new InMemoryReplayStore();
    resolvedRateLimiter = new SlidingWindowRateLimiter(config.rateLimitPerMinute);
  }

  const bridgeSenderIdentities: Partial<Record<keyof AdapterRegistry, string>> = {};
  if (config.email.username) {
    bridgeSenderIdentities.email = config.email.username;
  }

  const engine = new BridgeEngine(
    gateway,
    policy,
    resolvedIdempotencyStore,
    resolvedReplayStore,
    resolvedRateLimiter,
    auditLog,
    {
      replayTtlMs: config.replayTtlMs,
      enabledFanoutTargets: config.bridgeToggles,
      bridgeSenderIdentities,
      systemReplyTtlMs: 15_000,
    },
    commonKnowledge,
  );

  if (config.status.enabled) {
    adapters.status = new StatusAdapter(
      {
        bootstrapNodes: config.status.bootstrapNodes,
        privateKeyHex: config.status.privateKeyHex,
        communityId: config.status.communityId,
        chatId: config.status.chatId,
        expectedTopic: config.status.expectedTopic,
        allowedSenders: config.status.allowedSenders,
      },
      new StatusWakuClient({
        bootstrapNodes: config.status.bootstrapNodes,
        privateKeyHex: config.status.privateKeyHex,
        communityId: config.status.communityId,
        chatId: config.status.chatId,
        expectedTopic: config.status.expectedTopic,
        healthStaleMs: config.status.healthStaleMs,
      }),
    );
    engine.registerAdapter(adapters.status);
  }

  if (config.telegram.enabled) {
    adapters.telegram = new TelegramAdapter({
      botToken: config.telegram.botToken,
      webhookSecretToken: config.telegram.webhookSecretToken,
      allowedChatIds: config.telegram.allowedChatIds,
    });
    engine.registerAdapter(adapters.telegram);
  }

  if (config.whatsapp.enabled) {
    adapters.whatsapp = new WhatsAppAdapter({
      appSecret: config.whatsapp.appSecret,
      verifyToken: config.whatsapp.verifyToken,
      accessToken: config.whatsapp.accessToken,
      phoneNumberId: config.whatsapp.phoneNumberId,
      allowedSenders: config.whatsapp.allowedSenders,
    });
    engine.registerAdapter(adapters.whatsapp);
  }

  if (config.signal.enabled) {
    adapters.signal = new SignalAdapter({
      rpcUrl: config.signal.rpcUrl,
      trustedPeers: config.signal.trustedPeers,
    });
    engine.registerAdapter(adapters.signal);
  }

  if (config.discord.enabled) {
    adapters.discord = new DiscordAdapter({
      publicKeyHex: config.discord.publicKeyHex,
      applicationId: config.discord.applicationId,
      botToken: config.discord.botToken,
      allowedGuilds: config.discord.allowedGuilds,
    });
    engine.registerAdapter(adapters.discord);
  }

  if (config.slack.enabled) {
    adapters.slack = new SlackAdapter({
      signingSecret: config.slack.signingSecret,
      botToken: config.slack.botToken,
      allowedChannels: config.slack.allowedChannels,
    });
    engine.registerAdapter(adapters.slack);
  }

  if (config.email.enabled) {
    adapters.email = new EmailAdapter({
      imapHost: config.email.imapHost,
      imapPort: config.email.imapPort,
      smtpHost: config.email.smtpHost,
      smtpPort: config.email.smtpPort,
      username: config.email.username,
      password: config.email.password,
      allowedSenders: config.email.allowedSenders,
      requireDkimPass: config.email.requireDkimPass,
    });
    engine.registerAdapter(adapters.email);
  }

  const statusHumanIngressShim =
    adapters.status && config.status.chatId
      ? new StatusHumanIngressShim(adapters.status, config.status.chatId)
      : undefined;
  const statusLocalIngress =
    adapters.status && config.statusShimLocal.enabled
      ? new StatusLocalIngressService({
          statusAdapter: adapters.status,
          privateKeyHex: config.status.privateKeyHex,
          expectedTopic: config.status.expectedTopic,
          communityId: config.status.communityId,
          chatId: config.status.chatId,
        })
      : undefined;

  return new BridgeRuntimeImpl(
    config,
    adapters,
    commonKnowledge,
    health,
    statusHumanIngressShim,
    statusLocalIngress,
    engine,
    cleanups,
  );
};
