import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { BaseInboundAdapter } from "../src/channels/base.js";
import { StatusAdapter } from "../src/channels/status/adapter.js";
import { deriveStatusPublicKeyHex } from "../src/channels/status/waku-proof.js";
import { StatusWakuClient } from "../src/channels/status/waku-client.js";
import { StatusLocalIngressService } from "../src/common-knowledge/status-local-ingress.js";
import { CommonKnowledgeService } from "../src/common-knowledge/service.js";
import { BridgeEngine } from "../src/core/bridge-engine.js";
import { InMemoryIdempotencyStore, InMemoryReplayStore, SlidingWindowRateLimiter } from "../src/core/memory-stores.js";
import { ConsoleOpenClawGateway } from "../src/core/openclaw-gateway.js";
import { PolicyEngine } from "../src/core/policy-engine.js";
import { AuditEvent, AuditLog, OutboundMessage, RawInboundMessage, VerificationResult } from "../src/core/types.js";

const PRIVATE_KEY_HEX = `0x${"55".repeat(32)}`;
const TOPIC = "/openclaw/1/chat/proto";
const COMMUNITY = "0xcommunity";
const CHAT = "0xchat";

const createLoopbackSdk = (): Record<string, unknown> => ({
  async createLightNode() {
    return {
      async start() {
        return Promise.resolve();
      },
      async stop() {
        return Promise.resolve();
      },
      filter: {
        async subscribe() {
          return async () => Promise.resolve();
        },
      },
    };
  },
  createEncoder(value: unknown) {
    return value;
  },
  createDecoder(value: unknown) {
    return value;
  },
  async waitForRemotePeer() {
    return Promise.resolve();
  },
  Protocols: {
    Filter: "filter",
    LightPush: "lightpush",
  },
});

class TestGateway extends ConsoleOpenClawGateway {
  ingested: string[] = [];

  override async ingest(message: Parameters<ConsoleOpenClawGateway["ingest"]>[0]): Promise<void> {
    this.ingested.push(message.messageId);
  }
}

class MemoryAuditLog implements AuditLog {
  events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}

class TestAdapter extends BaseInboundAdapter {
  sent: OutboundMessage[] = [];

  constructor(readonly kind: RawInboundMessage["channel"]) {
    super();
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    return Promise.resolve();
  }

  async send(message: OutboundMessage): Promise<void> {
    this.sent.push(message);
  }

  async verify(_raw: RawInboundMessage): Promise<VerificationResult> {
    return {
      authenticated: true,
      mechanism: "test",
      confidence: "high",
    };
  }

  async normalize(raw: RawInboundMessage, verification: VerificationResult) {
    return {
      messageId: raw.id,
      sourceChannel: raw.channel,
      sourceSenderId: raw.senderId,
      sourceConversationId: raw.conversationId,
      createdAtMs: raw.timestampMs,
      kind: "text" as const,
      text: raw.payload,
      metadata: raw.metadata,
      cryptographicState: {
        authenticated: verification.authenticated,
        mechanism: verification.mechanism,
        confidence: verification.confidence,
      },
    };
  }
}

test("status local ingress injects a bridge-owned Status message into the normal routing flow", async () => {
  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const gateway = new TestGateway();
  const auditLog = new MemoryAuditLog();

  const status = new StatusAdapter(
    {
      bootstrapNodes: [],
      privateKeyHex: PRIVATE_KEY_HEX,
      communityId: COMMUNITY,
      chatId: CHAT,
      expectedTopic: TOPIC,
      allowedSenders: [senderPublicKey],
    },
    new StatusWakuClient({
      bootstrapNodes: [],
      privateKeyHex: PRIVATE_KEY_HEX,
      communityId: COMMUNITY,
      chatId: CHAT,
      expectedTopic: TOPIC,
      sdkModuleLoader: async () => createLoopbackSdk(),
    }),
  );

  const signal = new TestAdapter("signal");
  const policy = {
    rules: [
      {
        sourceChannel: "status" as const,
        requireAuthentication: true,
        maxPayloadBytes: 1024,
        fanoutTargets: ["signal" as const],
        fanoutConversationOverrides: {
          signal: "+15551234567",
        },
      },
      {
        sourceChannel: "signal" as const,
        requireAuthentication: true,
        maxPayloadBytes: 1024,
        fanoutTargets: [],
      },
    ],
  };

  const commonKnowledge = new CommonKnowledgeService({
    policy,
    statusPrivateKeyHex: PRIVATE_KEY_HEX,
    isChannelEnabled: (channel) => channel === "status" || channel === "signal",
  });

  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine(policy),
    new InMemoryIdempotencyStore(),
    new InMemoryReplayStore(),
    new SlidingWindowRateLimiter(60),
    auditLog,
    {
      replayTtlMs: 60_000,
      enabledFanoutTargets: {
        signal: true,
      },
    },
    commonKnowledge,
  );

  engine.registerAdapter(status);
  engine.registerAdapter(signal);
  await engine.start();

  const ingress = new StatusLocalIngressService({
    statusAdapter: status,
    privateKeyHex: PRIVATE_KEY_HEX,
    expectedTopic: TOPIC,
    communityId: COMMUNITY,
    chatId: CHAT,
  });

  const result = await ingress.injectHumanText('send "HELLO_LOCAL_STATUS" to signal');
  await sleep(20);

  assert.ok(result.messageId);
  assert.equal(gateway.ingested.length, 1);
  assert.equal(signal.sent.length, 1);
  assert.equal(signal.sent[0]?.conversationId, "+15551234567");
  assert.equal(signal.sent[0]?.text, "HELLO_LOCAL_STATUS");

  const accepted = auditLog.events.find((event) => event.type === "accepted" && event.channel === "status");
  assert.ok(accepted);
  assert.equal(accepted?.metadata?.mechanism, "status-bridge-shim-local-signed-payload");

  await engine.stop();
});

test("status local ingress rejects empty text", async () => {
  const status = new StatusAdapter(
    {
      bootstrapNodes: [],
      privateKeyHex: PRIVATE_KEY_HEX,
      communityId: COMMUNITY,
      chatId: CHAT,
      expectedTopic: TOPIC,
      allowedSenders: [],
    },
    new StatusWakuClient({
      bootstrapNodes: [],
      privateKeyHex: PRIVATE_KEY_HEX,
      communityId: COMMUNITY,
      chatId: CHAT,
      expectedTopic: TOPIC,
      sdkModuleLoader: async () => createLoopbackSdk(),
    }),
  );

  const ingress = new StatusLocalIngressService({
    statusAdapter: status,
    privateKeyHex: PRIVATE_KEY_HEX,
    expectedTopic: TOPIC,
    communityId: COMMUNITY,
    chatId: CHAT,
  });

  await assert.rejects(() => ingress.injectHumanText("   "), /must not be empty/);
});
