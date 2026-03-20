import { mkdir } from "node:fs/promises";
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
  statusHumanIngressShim?: StatusHumanIngressShim;
  statusLocalIngress?: StatusLocalIngressService;
  start(): Promise<void>;
  stop(): Promise<void>;
}

class BridgeRuntimeImpl implements BridgeRuntime {
  private started = false;

  constructor(
    public readonly config: RuntimeConfig,
    public readonly adapters: AdapterRegistry,
    public readonly commonKnowledge: CommonKnowledgeService,
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
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

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

export const createBridgeRuntime = async (env: NodeJS.ProcessEnv): Promise<BridgeRuntime> => {
  const config = loadConfigFromEnv(env);
  validateCriticalConfig(config);

  await ensureAuditDir(config.auditLogPath);

  const gateway = new ConsoleOpenClawGateway();
  const policy = new PolicyEngine(config.policy);
  const auditLog = new FileAuditLog(config.auditLogPath);
  const cleanups: Array<() => Promise<void>> = [];
  const adapters: AdapterRegistry = {};
  const commonKnowledge = new CommonKnowledgeService({
    policy: config.policy,
    statusPrivateKeyHex: config.status.enabled ? config.status.privateKeyHex || undefined : undefined,
    isChannelEnabled: (channel) => Boolean(adapters[channel]),
    isChannelHealthy: (channel) => Boolean(adapters[channel]),
  });

  let resolvedIdempotencyStore: IdempotencyStore;
  let resolvedReplayStore: ReplayStore;
  let resolvedRateLimiter: RateLimiter;

  if (config.storeBackend === "redis") {
    const redis = createClient({
      url: config.redisUrl,
    });
    await redis.connect();
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
    statusHumanIngressShim,
    statusLocalIngress,
    engine,
    cleanups,
  );
};

