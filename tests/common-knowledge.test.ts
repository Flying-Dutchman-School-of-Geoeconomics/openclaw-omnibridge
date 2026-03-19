import assert from "node:assert/strict";
import test from "node:test";
import { CommonKnowledgeService } from "../src/common-knowledge/service.js";
import { BridgePolicyRule, CanonicalMessage } from "../src/core/types.js";

const PRIVATE_KEY_HEX = `0x${"22".repeat(32)}`;

const baseRule: BridgePolicyRule = {
  sourceChannel: "status",
  requireAuthentication: true,
  maxPayloadBytes: 1024,
  fanoutTargets: ["signal", "email"],
};

const canonical = (text: string): CanonicalMessage => ({
  messageId: "m1",
  sourceChannel: "status",
  sourceSenderId: "alice",
  sourceConversationId: "status-chat",
  createdAtMs: Date.now(),
  kind: "text",
  text,
  metadata: {},
  cryptographicState: {
    authenticated: true,
    mechanism: "test",
    confidence: "high",
  },
});

test("common knowledge curation signs manifests and degrades unavailable routes", () => {
  const service = new CommonKnowledgeService({
    policy: {
      rules: [baseRule],
    },
    statusPrivateKeyHex: PRIVATE_KEY_HEX,
    isChannelEnabled: (channel) => channel === "status" || channel === "signal",
    isChannelHealthy: (channel) => channel === "status",
  });

  const manifest = service.createOfferManifest();
  const statusSurface = manifest.offers.find((offer) => offer.offerId === "status.surface");
  const signalSurface = manifest.offers.find((offer) => offer.offerId === "signal.surface");
  const degradedRoute = manifest.offers.find((offer) => offer.offerId === "status.to.signal");

  assert.equal(manifest.signature.algorithm, "ed25519");
  assert.equal(statusSurface?.state, "active");
  assert.equal(signalSurface?.state, "degraded");
  assert.equal(degradedRoute?.state, "degraded");
  assert.equal(manifest.offers.some((offer) => offer.offerId === "email.surface"), false);

  const rendered = service.renderOffersText(manifest);
  assert.match(rendered, /OpenClaw Common Knowledge/);
  assert.match(rendered, /Status/);
  assert.match(rendered, /Signal/);
});

test("common knowledge resolves deterministic send intent and falls through plain relay", () => {
  const service = new CommonKnowledgeService({
    policy: {
      rules: [baseRule],
    },
    statusPrivateKeyHex: PRIVATE_KEY_HEX,
    isChannelEnabled: (channel) => channel === "status" || channel === "signal",
  });

  const dispatch = service.resolveIntent({
    message: canonical('send "HELLO_STATUS_TO_SIGNAL" to signal'),
    rule: baseRule,
  });
  assert.equal(dispatch.intent, "send");
  assert.equal(dispatch.execution.outcome, "dispatch");
  assert.deepEqual(dispatch.execution.dispatchTargets, ["signal"]);
  assert.equal(dispatch.execution.dispatchText, "HELLO_STATUS_TO_SIGNAL");

  const reject = service.resolveIntent({
    message: canonical('send "HELLO_EMAIL" to email'),
    rule: baseRule,
  });
  assert.equal(reject.execution.outcome, "reject");
  assert.match(reject.execution.reply?.text ?? "", /disabled in this runtime/);

  const relay = service.resolveIntent({
    message: canonical("plain hello"),
    rule: baseRule,
  });
  assert.equal(relay.matched, false);
  assert.equal(relay.execution.outcome, "relay");
});

test("common knowledge explains status bridge-owned ingress explicitly", () => {
  const service = new CommonKnowledgeService({
    policy: {
      rules: [baseRule],
    },
    statusPrivateKeyHex: PRIVATE_KEY_HEX,
    isChannelEnabled: (channel) => channel === "status" || channel === "signal",
  });

  const resolution = service.resolveIntent({
    message: canonical("why can't I send from status"),
    rule: baseRule,
  });

  assert.equal(resolution.execution.outcome, "reply");
  assert.match(resolution.execution.reply?.text ?? "", /bridge-owned ingress mode/i);
  assert.match(resolution.execution.reply?.text ?? "", /native app traffic/i);
});
