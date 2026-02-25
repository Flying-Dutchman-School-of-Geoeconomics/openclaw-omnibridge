import { ChannelKind, BridgePolicy } from "./types.js";

export type StoreBackend = "memory" | "redis";

export interface RuntimeConfig {
  env: string;
  logLevel: string;
  httpPort: number;
  replayTtlMs: number;
  idempotencyTtlMs: number;
  rateLimitPerMinute: number;
  auditLogPath: string;
  storeBackend: StoreBackend;
  redisUrl: string;
  redisKeyPrefix: string;
  bridgeToggles: Partial<Record<ChannelKind, boolean>>;
  status: {
    enabled: boolean;
    bootstrapNodes: string[];
    privateKeyHex: string;
    expectedTopic: string;
    communityId: string;
    chatId: string;
    allowedSenders: string[];
  };
  whatsapp: {
    enabled: boolean;
    appSecret: string;
    verifyToken: string;
    accessToken: string;
    phoneNumberId: string;
    allowedSenders: string[];
  };
  telegram: {
    enabled: boolean;
    botToken: string;
    webhookSecretToken: string;
    allowedChatIds: string[];
  };
  signal: {
    enabled: boolean;
    rpcUrl: string;
    trustedPeers: string[];
  };
  discord: {
    enabled: boolean;
    applicationId: string;
    publicKeyHex: string;
    botToken: string;
    allowedGuilds: string[];
  };
  slack: {
    enabled: boolean;
    signingSecret: string;
    botToken: string;
    allowedChannels: string[];
  };
  email: {
    enabled: boolean;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    allowedSenders: string[];
    requireDkimPass: boolean;
  };
  policy: BridgePolicy;
}

const csv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const asBool = (value: string | undefined, fallback = false): boolean => {
  if (value == null) {
    return fallback;
  }

  return value.toLowerCase() === "true";
};

const asNum = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid number: ${value}`);
  }

  return parsed;
};

const asStoreBackend = (value: string | undefined): StoreBackend => {
  const normalized = (value ?? "memory").toLowerCase();
  if (normalized === "memory" || normalized === "redis") {
    return normalized;
  }

  throw new Error(`Invalid STORE_BACKEND value: ${value}`);
};

const asRequired = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
};

const defaultPolicy = (): BridgePolicy => ({
  rules: [
    {
      sourceChannel: "status",
      requireAuthentication: true,
      maxPayloadBytes: 32768,
      fanoutTargets: ["telegram", "discord", "slack", "email"],
    },
    {
      sourceChannel: "whatsapp",
      requireAuthentication: true,
      maxPayloadBytes: 16384,
      fanoutTargets: ["status", "slack", "email"],
    },
    {
      sourceChannel: "telegram",
      requireAuthentication: true,
      maxPayloadBytes: 16384,
      fanoutTargets: ["status", "discord", "email"],
    },
    {
      sourceChannel: "signal",
      requireAuthentication: true,
      maxPayloadBytes: 16384,
      fanoutTargets: ["status", "slack", "email"],
    },
    {
      sourceChannel: "discord",
      requireAuthentication: true,
      maxPayloadBytes: 16384,
      fanoutTargets: ["status", "slack", "email"],
    },
    {
      sourceChannel: "slack",
      requireAuthentication: true,
      maxPayloadBytes: 16384,
      fanoutTargets: ["status", "discord", "email"],
    },
    {
      sourceChannel: "email",
      requireAuthentication: true,
      maxPayloadBytes: 65536,
      fanoutTargets: ["status", "slack", "discord"],
    },
  ],
});

export const loadConfigFromEnv = (env: NodeJS.ProcessEnv): RuntimeConfig => {
  const bridgeToggles: RuntimeConfig["bridgeToggles"] = {
    discord: asBool(env.BRIDGE_ENABLE_DISCORD, false),
    slack: asBool(env.BRIDGE_ENABLE_SLACK, false),
    telegram: asBool(env.BRIDGE_ENABLE_TELEGRAM, false),
    whatsapp: asBool(env.BRIDGE_ENABLE_WHATSAPP, false),
    signal: asBool(env.BRIDGE_ENABLE_SIGNAL, false),
    email: asBool(env.BRIDGE_ENABLE_EMAIL, false),
    status: true,
  };

  return {
    env: env.OPENCLAW_ENV ?? "development",
    logLevel: env.OPENCLAW_LOG_LEVEL ?? "info",
    httpPort: asNum(env.OPENCLAW_HTTP_PORT, 8080),
    replayTtlMs: asNum(env.OPENCLAW_REPLAY_TTL_MS, 600000),
    idempotencyTtlMs: asNum(env.OPENCLAW_IDEMPOTENCY_TTL_MS, 604800000),
    rateLimitPerMinute: asNum(env.OPENCLAW_RATE_LIMIT_PER_MIN, 60),
    auditLogPath: env.OPENCLAW_AUDIT_LOG_PATH ?? "./var/audit.log",
    storeBackend: asStoreBackend(env.STORE_BACKEND),
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    redisKeyPrefix: env.REDIS_KEY_PREFIX ?? "openclaw",
    bridgeToggles,
    status: {
      enabled: asBool(env.STATUS_ENABLED, false),
      bootstrapNodes: csv(env.STATUS_WAKU_BOOTSTRAP_NODES),
      privateKeyHex: env.STATUS_PRIVATE_KEY_HEX ?? "",
      expectedTopic: env.STATUS_EXPECTED_TOPIC ?? "",
      communityId: env.STATUS_COMMUNITY_ID ?? "",
      chatId: env.STATUS_CHAT_ID ?? "",
      allowedSenders: csv(env.STATUS_ALLOWED_SENDERS),
    },
    whatsapp: {
      enabled: asBool(env.WHATSAPP_ENABLED, false),
      appSecret: env.WHATSAPP_APP_SECRET ?? "",
      verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? "",
      accessToken: env.WHATSAPP_ACCESS_TOKEN ?? "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      allowedSenders: csv(env.WHATSAPP_ALLOWED_SENDERS),
    },
    telegram: {
      enabled: asBool(env.TELEGRAM_ENABLED, false),
      botToken: env.TELEGRAM_BOT_TOKEN ?? "",
      webhookSecretToken: env.TELEGRAM_WEBHOOK_SECRET_TOKEN ?? "",
      allowedChatIds: csv(env.TELEGRAM_ALLOWED_CHAT_IDS),
    },
    signal: {
      enabled: asBool(env.SIGNAL_ENABLED, false),
      rpcUrl: env.SIGNAL_RPC_URL ?? "",
      trustedPeers: csv(env.SIGNAL_TRUSTED_PEERS),
    },
    discord: {
      enabled: asBool(env.DISCORD_ENABLED, false),
      applicationId: env.DISCORD_APPLICATION_ID ?? "",
      publicKeyHex: env.DISCORD_PUBLIC_KEY ?? "",
      botToken: env.DISCORD_BOT_TOKEN ?? "",
      allowedGuilds: csv(env.DISCORD_ALLOWED_GUILDS),
    },
    slack: {
      enabled: asBool(env.SLACK_ENABLED, false),
      signingSecret: env.SLACK_SIGNING_SECRET ?? "",
      botToken: env.SLACK_BOT_TOKEN ?? "",
      allowedChannels: csv(env.SLACK_ALLOWED_CHANNELS),
    },
    email: {
      enabled: asBool(env.EMAIL_ENABLED, false),
      imapHost: env.EMAIL_IMAP_HOST ?? "",
      imapPort: asNum(env.EMAIL_IMAP_PORT, 993),
      smtpHost: env.EMAIL_SMTP_HOST ?? "",
      smtpPort: asNum(env.EMAIL_SMTP_PORT, 587),
      username: env.EMAIL_USERNAME ?? "",
      password: env.EMAIL_PASSWORD ?? "",
      allowedSenders: csv(env.EMAIL_ALLOWED_SENDERS),
      requireDkimPass: asBool(env.EMAIL_REQUIRE_DKIM_PASS, true),
    },
    policy: defaultPolicy(),
  };
};

export const validateCriticalConfig = (config: RuntimeConfig): void => {
  if (config.storeBackend === "redis") {
    asRequired("REDIS_URL", config.redisUrl);
  }

  if (config.status.enabled) {
    asRequired("STATUS_PRIVATE_KEY_HEX", config.status.privateKeyHex);
    if (config.status.bootstrapNodes.length === 0) {
      throw new Error("STATUS_WAKU_BOOTSTRAP_NODES required when STATUS_ENABLED=true");
    }
    asRequired("STATUS_EXPECTED_TOPIC", config.status.expectedTopic);
    asRequired("STATUS_COMMUNITY_ID", config.status.communityId);
    asRequired("STATUS_CHAT_ID", config.status.chatId);
  }

  if (config.whatsapp.enabled) {
    asRequired("WHATSAPP_APP_SECRET", config.whatsapp.appSecret);
    asRequired("WHATSAPP_ACCESS_TOKEN", config.whatsapp.accessToken);
    asRequired("WHATSAPP_PHONE_NUMBER_ID", config.whatsapp.phoneNumberId);
  }

  if (config.telegram.enabled) {
    asRequired("TELEGRAM_BOT_TOKEN", config.telegram.botToken);
    asRequired("TELEGRAM_WEBHOOK_SECRET_TOKEN", config.telegram.webhookSecretToken);
  }

  if (config.discord.enabled) {
    asRequired("DISCORD_PUBLIC_KEY", config.discord.publicKeyHex);
  }

  if (config.slack.enabled) {
    asRequired("SLACK_SIGNING_SECRET", config.slack.signingSecret);
  }

  if (config.email.enabled) {
    asRequired("EMAIL_SMTP_HOST", config.email.smtpHost);
    asRequired("EMAIL_IMAP_HOST", config.email.imapHost);
    asRequired("EMAIL_USERNAME", config.email.username);
    asRequired("EMAIL_PASSWORD", config.email.password);
  }
};
