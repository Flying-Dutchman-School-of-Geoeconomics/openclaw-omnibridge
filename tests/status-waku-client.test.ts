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
  sdkModule: Record<string, unknown>;
}

const createFakeSdkHarness = (): FakeSdkHarness => {
  let subscriber: ((message: unknown) => void) | null = null;
  const sent: Array<Record<string, unknown>> = [];

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
  };

  return {
    sent,
    emitInbound(message: Record<string, unknown>) {
      subscriber?.(message);
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
