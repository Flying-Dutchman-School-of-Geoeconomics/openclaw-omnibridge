import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStatusPublicKeyHex,
  signStatusPayload,
  verifySignedStatusPayload,
} from "../src/channels/status/waku-proof.js";

const PRIVATE_KEY_HEX = `0x${"22".repeat(32)}`;

test("status signed payload verification accepts valid signatures", () => {
  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const signed = signStatusPayload(
    {
      senderPublicKey,
      communityId: "0xcommunity",
      chatId: "0xchat",
      topic: "/openclaw/1/chat/proto",
      contentType: "text/plain",
      payload: "hello",
    },
    PRIVATE_KEY_HEX,
  );

  const result = verifySignedStatusPayload(signed);
  assert.equal(result.ok, true);
});

test("status signed payload verification rejects tampering", () => {
  const senderPublicKey = deriveStatusPublicKeyHex(PRIVATE_KEY_HEX);
  const signed = signStatusPayload(
    {
      senderPublicKey,
      communityId: "0xcommunity",
      chatId: "0xchat",
      topic: "/openclaw/1/chat/proto",
      contentType: "text/plain",
      payload: "hello",
    },
    PRIVATE_KEY_HEX,
  );

  const tampered = {
    ...signed,
    payload: "hello-tampered",
  };

  const result = verifySignedStatusPayload(tampered);
  assert.equal(result.ok, false);
});
