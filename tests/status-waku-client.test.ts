import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStatusPublicKeyHex,
  signStatusPayload,
} from "../src/channels/status/waku-proof.js";
import { StatusWakuClient } from "../src/channels/status/waku-client.js";

const PRIVATE_KEY_HEX = `0x${"11".repeat(32)}`;
const TOPIC = "/openclaw/1/chat/proto";
const COMMUNITY = "0xcommunity";
const CHAT = "0xchat";

interface FakeSdkHarness {
  sent: Array<Record<string, unknown>>;
  emitInbound(message: Record<string, unknown>): void;
  setPeerCount(count: number): void;
  sdkModule: Record<string, unknown>;
}

const createFakeSdkHarness = (): FakeSdkHarness => {
  let subscriber: ((message: unknown) => void) | null = null;
  const sent: Array<Record<string, unknown>> = [];
  let peerCount = 1;

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
        sent.push(message);
      },
    },
    libp2p: {
      getConnections() {
        return Array.from({ length: peerCount }, () => ({}));
      },
    },
  };

  return {
    sent,
    emitInbound(message: Record<string, unknown>) {
      subscriber?.(message);
    },
    setPeerCount(count: number) {
      peerCount = count;
    },
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

test("status waku client accepts valid signed payload", async () => {
  const harness = createFakeSdkHarness();
  const client = new StatusWakuClient({
    bootstrapNodes: [],
    privateKeyHex: PRIVATE_KEY_HEX,
    communityId: COMMUNITY,
    chatId: CHAT,
    expectedTopic: TOPIC,
    sdkModuleLoader: async () => harness.sdkModule,
  });

  const messages: Array<{ id: string }> = [];
  client.on("message", (message) => {
    messages.push({ id: message.id });
  });

  await client.connect();

  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const signed = signStatusPayload(
    {
      senderPublicKey,
      communityId: COMMUNITY,
      chatId: CHAT,
      topic: TOPIC,
      contentType: "text/plain",
      payload: "hello",
    },
    PRIVATE_KEY_HEX,
  );

  harness.emitInbound({
    payload: new TextEncoder().encode(JSON.stringify(signed)),
  });

  assert.equal(messages.length, 1);
  await client.disconnect();
});

test("status waku client drops invalid signature payloads", async () => {
  const harness = createFakeSdkHarness();
  const client = new StatusWakuClient({
    bootstrapNodes: [],
    privateKeyHex: PRIVATE_KEY_HEX,
    communityId: COMMUNITY,
    chatId: CHAT,
    expectedTopic: TOPIC,
    sdkModuleLoader: async () => harness.sdkModule,
  });

  const messages: Array<{ id: string }> = [];
  client.on("message", (message) => {
    messages.push({ id: message.id });
  });

  await client.connect();

  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const signed = signStatusPayload(
    {
      senderPublicKey,
      communityId: COMMUNITY,
      chatId: CHAT,
      topic: TOPIC,
      contentType: "text/plain",
      payload: "hello",
    },
    PRIVATE_KEY_HEX,
  );

  const tampered = {
    ...signed,
    payload: "tampered",
  };

  harness.emitInbound({
    payload: new TextEncoder().encode(JSON.stringify(tampered)),
  });

  assert.equal(messages.length, 0);
  await client.disconnect();
});

test("status waku client publishes signed payloads", async () => {
  const harness = createFakeSdkHarness();
  const client = new StatusWakuClient({
    bootstrapNodes: [],
    privateKeyHex: PRIVATE_KEY_HEX,
    communityId: COMMUNITY,
    chatId: CHAT,
    expectedTopic: TOPIC,
    sdkModuleLoader: async () => harness.sdkModule,
  });

  await client.connect();
  await client.publishText("from-client");

  assert.equal(harness.sent.length, 1);

  const payloadBytes = harness.sent[0]?.payload as Uint8Array;
  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>;
  assert.equal(payload.topic, TOPIC);
  assert.equal(payload.communityId, COMMUNITY);
  assert.equal(payload.chatId, CHAT);
  assert.equal(payload.payload, "from-client");
  assert.equal(typeof payload.signature, "string");

  await client.disconnect();
});

test("status waku client degrades after a warning until a later healthy event", async () => {
  const harness = createFakeSdkHarness();
  const client = new StatusWakuClient({
    bootstrapNodes: [],
    privateKeyHex: PRIVATE_KEY_HEX,
    communityId: COMMUNITY,
    chatId: CHAT,
    expectedTopic: TOPIC,
    sdkModuleLoader: async () => harness.sdkModule,
  });

  await client.connect();
  assert.equal(client.transportHealth().state, "healthy");

  harness.emitInbound({
    payload: new TextEncoder().encode("{not-json"),
  });

  const degraded = client.transportHealth();
  assert.equal(degraded.state, "degraded");
  assert.match(degraded.detail, /recent Waku warning: malformed payload JSON/);
  assert.equal(degraded.lastWarningReason, "malformed payload JSON");

  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const signed = signStatusPayload(
    {
      senderPublicKey,
      communityId: COMMUNITY,
      chatId: CHAT,
      topic: TOPIC,
      contentType: "text/plain",
      payload: "recovered",
    },
    PRIVATE_KEY_HEX,
  );

  harness.emitInbound({
    payload: new TextEncoder().encode(JSON.stringify(signed)),
  });

  const recovered = client.transportHealth();
  assert.equal(recovered.state, "healthy");
  assert.equal(recovered.lastHealthyEvent, "message");

  await client.disconnect();
});

test("status waku client degrades stale transports after silent peer loss", async () => {
  const realDateNow = Date.now;
  let nowMs = 1_000;
  Date.now = () => nowMs;

  const harness = createFakeSdkHarness();
  const client = new StatusWakuClient({
    bootstrapNodes: [],
    privateKeyHex: PRIVATE_KEY_HEX,
    communityId: COMMUNITY,
    chatId: CHAT,
    expectedTopic: TOPIC,
    healthStaleMs: 1_000,
    sdkModuleLoader: async () => harness.sdkModule,
  });

  try {
    await client.connect();
    assert.equal(client.transportHealth().state, "healthy");

    harness.setPeerCount(0);
    nowMs = 2_500;

    const degraded = client.transportHealth();
    assert.equal(degraded.state, "degraded");
    assert.match(degraded.detail, /no live peers observed/);

    harness.setPeerCount(1);
    nowMs = 2_600;

    const recovered = client.transportHealth();
    assert.equal(recovered.state, "healthy");
    assert.match(recovered.detail, /live peer/);
  } finally {
    Date.now = realDateNow;
    await client.disconnect();
  }
});
