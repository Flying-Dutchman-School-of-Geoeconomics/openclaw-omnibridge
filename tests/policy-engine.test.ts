import assert from "node:assert/strict";
import test from "node:test";
import { PolicyEngine } from "../src/core/policy-engine.js";
import { PolicyError } from "../src/core/errors.js";
import { BridgePolicy, CanonicalMessage, RawInboundMessage } from "../src/core/types.js";

const policy: BridgePolicy = {
  rules: [
    {
      sourceChannel: "status",
      requireAuthentication: true,
      maxPayloadBytes: 10,
      fanoutTargets: ["telegram"],
      allowedSenders: ["0xabc"],
      allowedCommands: ["help"],
    },
  ],
};

test("policy rejects oversized payload", () => {
  const engine = new PolicyEngine(policy);
  const rule = engine.resolveRule("status");

  const raw: RawInboundMessage = {
    id: "1",
    channel: "status",
    senderId: "0xabc",
    conversationId: "chat",
    timestampMs: Date.now(),
    payload: "12345678901",
    contentType: "text/plain",
    headers: {},
    metadata: {},
  };

  assert.throws(() => engine.enforcePayloadLimit(raw, rule), PolicyError);
});

test("policy allows authenticated allowlisted command", () => {
  const engine = new PolicyEngine(policy);
  const rule = engine.resolveRule("status");

  const msg: CanonicalMessage = {
    messageId: "m1",
    sourceChannel: "status",
    sourceSenderId: "0xabc",
    sourceConversationId: "chat",
    createdAtMs: Date.now(),
    kind: "command",
    commandName: "help",
    commandArgs: [],
    metadata: {},
    cryptographicState: {
      authenticated: true,
      mechanism: "waku-envelope-signature",
      confidence: "high",
    },
  };

  engine.enforceAuthentication(msg, rule);
  engine.enforceSenderAllowlist(msg, rule);
  engine.enforceCommandAllowlist(msg, rule);
  assert.ok(true);
});
