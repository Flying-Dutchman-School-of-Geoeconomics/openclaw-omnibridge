import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { BaseInboundAdapter } from "../src/channels/base.js";
import { StatusAdapter } from "../src/channels/status/adapter.js";
import { deriveStatusPublicKeyHex } from "../src/channels/status/waku-proof.js";
import { StatusWakuClient } from "../src/channels/status/waku-client.js";
import { CommonKnowledgeService } from "../src/common-knowledge/service.js";
import { StatusHumanIngressShim } from "../src/common-knowledge/status-human-ingress-shim.js";
import { ConsoleAuditLog } from "../src/core/audit-log.js";
import { BridgeEngine } from "../src/core/bridge-engine.js";
import { InMemoryIdempotencyStore, InMemoryReplayStore, SlidingWindowRateLimiter } from "../src/core/memory-stores.js";
import { ConsoleOpenClawGateway } from "../src/core/openclaw-gateway.js";
import { PolicyEngine } from "../src/core/policy-engine.js";
import { OutboundMessage, RawInboundMessage, VerificationResult } from "../src/core/types.js";

const PRIVATE_KEY_HEX = `0x${"44".repeat(32)}`;
const TOPIC = "/openclaw/1/chat/proto";
const COMMUNITY = "0xcommunity";
const CHAT = "0xchat";

interface LoopbackHarness {
  sdkModule: Record<string, unknown>;
}

const createLoopbackHarness = (): LoopbackHarness => {
  let subscriber: ((message: unknown) => void) | null = null;

  const node = {
    async start() {
      return Promise.resolve();
    },
    async stop() {
      return Promise.resolve();
    },
    filter: {
      async subscribe(_decoders: unknown[], callback: (message: unknown) => void) {
        subscriber = callback;
        return async () => {
          subscriber = null;
        };
      },
    },
    lightPush: {
      async send(_encoder: unknown, message: Record<string, unknown>) {
        subscriber?.({
          payload: message.payload,
        });
      },
    },
  };

  return {
    sdkModule: {
      async createLightNode() {
        return node;
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
    },
  };
};

class TestGateway extends ConsoleOpenClawGateway {
  ingested: string[] = [];

  override async ingest(message: Parameters<ConsoleOpenClawGateway["ingest"]>[0]): Promise<void> {
    this.ingested.push(message.messageId);
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

test("status human ingress shim publishes signed status text that the adapter accepts and dispatches", async () => {
  const harness = createLoopbackHarness();
  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const gateway = new TestGateway();

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
      sdkModuleLoader: async () => harness.sdkModule,
    }),
  );

  const signal = new TestAdapter("signal");
  const commonKnowledge = new CommonKnowledgeService({
    policy: {
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["signal"],
        },
        {
          sourceChannel: "signal",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: [],
        },
      ],
    },
    statusPrivateKeyHex: PRIVATE_KEY_HEX,
    isChannelEnabled: (channel) => channel === "status" || channel === "signal",
  });

  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine({
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["signal"],
          fanoutConversationOverrides: {
            signal: "+15551234567",
          },
        },
        {
          sourceChannel: "signal",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: [],
        },
      ],
    }),
    new InMemoryIdempotencyStore(),
    new InMemoryReplayStore(),
    new SlidingWindowRateLimiter(60),
    new ConsoleAuditLog(),
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

  const shim = new StatusHumanIngressShim(status, CHAT);
  await shim.publishHumanText('send "HELLO_STATUS_TO_SIGNAL" to signal');
  await sleep(20);

  assert.equal(gateway.ingested.length, 1);
  assert.equal(signal.sent.length, 1);
  assert.equal(signal.sent[0]?.conversationId, "+15551234567");
  assert.equal(signal.sent[0]?.text, "HELLO_STATUS_TO_SIGNAL");

  await engine.stop();
});
