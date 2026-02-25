import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  verifyDiscordEd25519Signature,
  verifySlackSignature,
  verifyStatusEnvelope,
  verifyTelegramSecretToken,
  verifyWhatsAppWebhookSignature,
} from "../src/crypto/verifiers.js";

test("verifySlackSignature accepts valid signature", () => {
  const secret = "shh";
  const timestamp = "1700000000";
  const body = '{"type":"event_callback"}';
  const base = `v0:${timestamp}:${body}`;
  const signature = createHmac("sha256", secret).update(base).digest("hex");

  const result = verifySlackSignature(secret, timestamp, body, `v0=${signature}`);
  assert.equal(result.authenticated, true);
});

test("verifyTelegramSecretToken rejects mismatch", () => {
  const result = verifyTelegramSecretToken("expected", "provided");
  assert.equal(result.authenticated, false);
});

test("verifyWhatsAppWebhookSignature accepts valid x-hub signature", () => {
  const secret = "app-secret";
  const body = '{"object":"whatsapp_business_account"}';
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const result = verifyWhatsAppWebhookSignature(secret, body, `sha256=${signature}`);
  assert.equal(result.authenticated, true);
});

test("verifyDiscordEd25519Signature accepts valid signature", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const message = "1700000000{\"type\":1}";
  const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("hex");

  const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const rawPublicKey = spkiDer.subarray(spkiDer.length - 32).toString("hex");

  const result = verifyDiscordEd25519Signature(rawPublicKey, "1700000000", '{"type":1}', signature);
  assert.equal(result.authenticated, true);
});

test("verifyStatusEnvelope accepts scoped, signed payloads", () => {
  const result = verifyStatusEnvelope({
    senderId: "0xabc",
    expectedTopic: "/openclaw/1/chat/proto",
    providedTopic: "/openclaw/1/chat/proto",
    expectedCommunityId: "0xcommunity",
    providedCommunityId: "0xcommunity",
    expectedChatId: "0xchat",
    providedChatId: "0xchat",
    signatureVerifiedByWaku: true,
    signatureProof: "proof",
    allowedSenders: ["0xabc"],
  });

  assert.equal(result.authenticated, true);
});

test("verifyStatusEnvelope rejects topic mismatch", () => {
  const result = verifyStatusEnvelope({
    senderId: "0xabc",
    expectedTopic: "/openclaw/1/chat/proto",
    providedTopic: "/openclaw/1/chat/other",
    expectedCommunityId: "0xcommunity",
    providedCommunityId: "0xcommunity",
    expectedChatId: "0xchat",
    providedChatId: "0xchat",
    signatureVerifiedByWaku: true,
    signatureProof: "proof",
    allowedSenders: [],
  });

  assert.equal(result.authenticated, false);
});
