import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { BaseInboundAdapter } from "../src/channels/base.js";
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
