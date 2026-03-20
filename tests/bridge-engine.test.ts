import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { BaseInboundAdapter } from "../src/channels/base.js";
import { CommonKnowledgeService } from "../src/common-knowledge/service.js";
import { ConsoleAuditLog } from "../src/core/audit-log.js";
import { BridgeEngine } from "../src/core/bridge-engine.js";
import { InMemoryIdempotencyStore, InMemoryReplayStore, SlidingWindowRateLimiter } from "../src/core/memory-stores.js";
import { ConsoleOpenClawGateway } from "../src/core/openclaw-gateway.js";
import { PolicyEngine } from "../src/core/policy-engine.js";
import { OutboundMessage, RawInboundMessage, VerificationResult } from "../src/core/types.js";

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
      metadata: {},
      cryptographicState: {
        authenticated: verification.authenticated,
        mechanism: verification.mechanism,
        confidence: verification.confidence,
      },
    };
  }
}

const createCommonKnowledge = (enabledChannels: RawInboundMessage["channel"][]): CommonKnowledgeService =>
  new CommonKnowledgeService({
    policy: {
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["telegram", "signal"],
        },
        {
          sourceChannel: "telegram",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: [],
        },
        {
          sourceChannel: "signal",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: [],
        },
      ],
    },
    statusPrivateKeyHex: `0x${"33".repeat(32)}`,
    isChannelEnabled: (channel) => enabledChannels.includes(channel),
  });

test("bridge engine ingests and forwards", async () => {
  const gateway = new TestGateway();
  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine({
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["telegram"],
        },
        {
          sourceChannel: "telegram",
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
        telegram: true,
      },
    },
    createCommonKnowledge(["status", "telegram"]),
  );

  const status = new TestAdapter("status");
  const telegram = new TestAdapter("telegram");

  engine.registerAdapter(status);
  engine.registerAdapter(telegram);
  await engine.start();

  await status.simulateInbound({
    id: "m1",
    channel: "status",
    senderId: "alice",
    conversationId: "c1",
    timestampMs: Date.now(),
    nonce: "n1",
    payload: "hello",
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  assert.deepEqual(gateway.ingested, ["m1"]);
  assert.equal(telegram.sent.length, 1);
  assert.equal(telegram.sent[0]?.text.includes("hello"), true);

  await engine.stop();
});

test("bridge engine applies target conversation override for status to signal fanout", async () => {
  const gateway = new TestGateway();
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
    createCommonKnowledge(["status", "signal"]),
  );

  const status = new TestAdapter("status");
  const signal = new TestAdapter("signal");

  engine.registerAdapter(status);
  engine.registerAdapter(signal);
  await engine.start();

  await status.simulateInbound({
    id: "m2",
    channel: "status",
    senderId: "0xstatussender",
    conversationId: "0xstatuschat",
    timestampMs: Date.now(),
    nonce: "n2",
    payload: "hello-signal",
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  assert.equal(signal.sent.length, 1);
  assert.equal(signal.sent[0]?.conversationId, "+15551234567");
  assert.equal(signal.sent[0]?.text.includes("hello-signal"), true);

  await engine.stop();
});

test("bridge engine replies in-channel for common knowledge help", async () => {
  const gateway = new TestGateway();
  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine({
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["telegram"],
        },
        {
          sourceChannel: "telegram",
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
        telegram: true,
      },
    },
    createCommonKnowledge(["status", "telegram"]),
  );

  const status = new TestAdapter("status");
  const telegram = new TestAdapter("telegram");
  engine.registerAdapter(status);
  engine.registerAdapter(telegram);
  await engine.start();

  await status.simulateInbound({
    id: "help-1",
    channel: "status",
    senderId: "alice",
    conversationId: "status-chat",
    timestampMs: Date.now(),
    nonce: "help-nonce",
    payload: "help",
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  assert.deepEqual(gateway.ingested, ["help-1"]);
  assert.equal(status.sent.length, 1);
  assert.equal(telegram.sent.length, 0);
  assert.match(status.sent[0]?.text ?? "", /bridge-owned shim/i);

  await engine.stop();
});

test("bridge engine dispatches only the explicitly requested target", async () => {
  const gateway = new TestGateway();
  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine({
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["telegram", "signal"],
        },
        {
          sourceChannel: "telegram",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: [],
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
        telegram: true,
        signal: true,
      },
    },
    createCommonKnowledge(["status", "telegram", "signal"]),
  );

  const status = new TestAdapter("status");
  const telegram = new TestAdapter("telegram");
  const signal = new TestAdapter("signal");
  engine.registerAdapter(status);
  engine.registerAdapter(telegram);
  engine.registerAdapter(signal);
  await engine.start();

  await status.simulateInbound({
    id: "dispatch-1",
    channel: "status",
    senderId: "alice",
    conversationId: "status-chat",
    timestampMs: Date.now(),
    nonce: "dispatch-nonce",
    payload: 'send "HELLO_SIGNAL_ONLY" to signal',
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  assert.deepEqual(gateway.ingested, ["dispatch-1"]);
  assert.equal(signal.sent.length, 1);
  assert.equal(signal.sent[0]?.text, "HELLO_SIGNAL_ONLY");
  assert.equal(telegram.sent.length, 0);

  await engine.stop();
});

test("bridge engine suppresses reply loops using fallback fingerprinting", async () => {
  const gateway = new TestGateway();
  const engine = new BridgeEngine(
    gateway,
    new PolicyEngine({
      rules: [
        {
          sourceChannel: "status",
          requireAuthentication: true,
          maxPayloadBytes: 1024,
          fanoutTargets: ["telegram"],
        },
        {
          sourceChannel: "telegram",
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
        telegram: true,
      },
      systemReplyTtlMs: 60_000,
    },
    createCommonKnowledge(["status", "telegram"]),
  );

  const status = new TestAdapter("status");
  const telegram = new TestAdapter("telegram");
  engine.registerAdapter(status);
  engine.registerAdapter(telegram);
  await engine.start();

  await status.simulateInbound({
    id: "loop-source",
    channel: "status",
    senderId: "alice",
    conversationId: "status-chat",
    timestampMs: Date.now(),
    nonce: "loop-source-nonce",
    payload: "help",
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  const replyText = status.sent[0]?.text ?? "";
  assert.ok(replyText.length > 0);

  await status.simulateInbound({
    id: "loop-echo",
    channel: "status",
    senderId: "alice",
    conversationId: "status-chat",
    timestampMs: Date.now(),
    nonce: "loop-echo-nonce",
    payload: replyText,
    contentType: "text/plain",
    headers: {},
    metadata: {},
  });

  await sleep(20);

  assert.deepEqual(gateway.ingested, ["loop-source"]);
  assert.equal(status.sent.length, 1);
  assert.equal(telegram.sent.length, 0);

  await engine.stop();
});
