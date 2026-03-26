import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigFromEnv, validateCriticalConfig } from "../src/core/config.js";

test("loadConfigFromEnv honors OPENCLAW_POLICY_PATH", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "openclaw-policy-test-"));
  const policyPath = path.join(dir, "policy.json");

  writeFileSync(
    policyPath,
    JSON.stringify({
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
      ],
    }),
    "utf8",
  );

  try {
    const config = loadConfigFromEnv({
      OPENCLAW_POLICY_PATH: policyPath,
    });

    assert.equal(config.policy.rules.length, 1);
    assert.deepEqual(config.policy.rules[0]?.fanoutTargets, ["signal"]);
    assert.equal(config.policy.rules[0]?.fanoutConversationOverrides?.signal, "+15551234567");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateCriticalConfig accepts enabled local Status inject with a long shared secret", () => {
  const config = loadConfigFromEnv({
    STATUS_ENABLED: "true",
    STATUS_PRIVATE_KEY_HEX: `0x${"11".repeat(32)}`,
    STATUS_WAKU_BOOTSTRAP_NODES: "/dns4/node-01.status.example/tcp/8000/wss/p2p/peer",
    STATUS_EXPECTED_TOPIC: "/openclaw/1/chat/proto",
    STATUS_COMMUNITY_ID: "0xcommunity",
    STATUS_CHAT_ID: "0xchat",
    STATUS_SHIM_LOCAL_ENABLED: "true",
    STATUS_SHIM_SHARED_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
  });

  assert.doesNotThrow(() => validateCriticalConfig(config));
});

test("validateCriticalConfig rejects local Status inject when shared secret is too short", () => {
  const config = loadConfigFromEnv({
    STATUS_ENABLED: "true",
    STATUS_PRIVATE_KEY_HEX: `0x${"11".repeat(32)}`,
    STATUS_WAKU_BOOTSTRAP_NODES: "/dns4/node-01.status.example/tcp/8000/wss/p2p/peer",
    STATUS_EXPECTED_TOPIC: "/openclaw/1/chat/proto",
    STATUS_COMMUNITY_ID: "0xcommunity",
    STATUS_CHAT_ID: "0xchat",
    STATUS_SHIM_LOCAL_ENABLED: "true",
    STATUS_SHIM_SHARED_SECRET: "too-short",
  });

  assert.throws(() => validateCriticalConfig(config), /at least 32 characters/);
});
