import { StatusLocalIngressService } from "../src/common-knowledge/status-local-ingress.js";
import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { BridgeHttpServer } from "../src/server.js";
import { RuntimeHealthReporter, RuntimeHealthSnapshot } from "../src/reliability/types.js";

const requestText = (
  port: number,
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> =>
  new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(payload).toString(),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });

const requestJson = (
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> => requestText(port, path, "POST", body, headers);

const staticHealthReporter = (snapshot: RuntimeHealthSnapshot): RuntimeHealthReporter => ({
  async start() {},
  async stop() {},
  async refresh() {
    return snapshot;
  },
  healthz() {
    return {
      ok: true,
      checkedAt: snapshot.checkedAt,
      checkedAtMs: snapshot.checkedAtMs,
    };
  },
  readyz() {
    return snapshot;
  },
  isChannelHealthy() {
    return snapshot.ready;
  },
  channelReason() {
    return snapshot.reasons[0];
  },
});

test("BridgeHttpServer accepts a local Status shim inject request on loopback with the correct secret", async () => {
  const calls: string[] = [];
  const server = new BridgeHttpServer({
    port: 0,
    statusLocalIngress: {
      async injectHumanText(text: string) {
        calls.push(text);
        return {
          messageId: "msg-1",
        };
      },
    }as unknown as StatusLocalIngressService,
    statusLocalIngressSharedSecret: "abcdefghijklmnopqrstuvwxyz012345",
  });

  await server.start();
  try {
    const res = await requestJson(
      server.listeningPort,
      "/internal/status-shim/messages",
      { text: "HELLO_STATUS_TO_SIGNAL" },
      {
        "x-openclaw-status-shim-secret": "abcdefghijklmnopqrstuvwxyz012345",
      },
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ["HELLO_STATUS_TO_SIGNAL"]);
    assert.match(res.body, /"messageId":"msg-1"/);
  } finally {
    await server.stop();
  }
});

test("BridgeHttpServer rejects a local Status shim inject request with the wrong secret", async () => {
  const server = new BridgeHttpServer({
    port: 0,
    statusLocalIngress: {
      async injectHumanText() {
        return {
          messageId: "msg-1",
        };
      },
    }as unknown as StatusLocalIngressService,
    statusLocalIngressSharedSecret: "abcdefghijklmnopqrstuvwxyz012345",
  });

  await server.start();
  try {
    const res = await requestJson(
      server.listeningPort,
      "/internal/status-shim/messages",
      { text: "HELLO_STATUS_TO_SIGNAL" },
      {
        "x-openclaw-status-shim-secret": "wrong-secret-value-abcdefghijklmnopqrstuvwxyz",
      },
    );

    assert.equal(res.statusCode, 403);
    assert.match(res.body, /invalid_status_shim_secret/);
  } finally {
    await server.stop();
  }
});

test("BridgeHttpServer rejects a local Status shim inject request with blank text", async () => {
  const server = new BridgeHttpServer({
    port: 0,
    statusLocalIngress: {
      async injectHumanText() {
        return {
          messageId: "msg-1",
        };
      },
    }as unknown as StatusLocalIngressService,
    statusLocalIngressSharedSecret: "abcdefghijklmnopqrstuvwxyz012345",
  });

  await server.start();
  try {
    const res = await requestJson(
      server.listeningPort,
      "/internal/status-shim/messages",
      { text: "   " },
      {
        "x-openclaw-status-shim-secret": "abcdefghijklmnopqrstuvwxyz012345",
      },
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body, /text_required/);
  } finally {
    await server.stop();
  }
});

test("BridgeHttpServer reports local Status shim inject as unavailable when not configured", async () => {
  const server = new BridgeHttpServer({
    port: 0,
  });

  await server.start();
  try {
    const res = await requestJson(
      server.listeningPort,
      "/internal/status-shim/messages",
      { text: "HELLO_STATUS_TO_SIGNAL" },
      {
        "x-openclaw-status-shim-secret": "abcdefghijklmnopqrstuvwxyz012345",
      },
    );

    assert.equal(res.statusCode, 503);
    assert.match(res.body, /status_local_ingress_unavailable/);
  } finally {
    await server.stop();
  }
});

test("BridgeHttpServer exposes canonical healthz and readyz endpoints", async () => {
  const snapshot: RuntimeHealthSnapshot = {
    ok: false,
    ready: false,
    checkedAt: new Date(1_700_000_000_000).toISOString(),
    checkedAtMs: 1_700_000_000_000,
    dependencies: [
      {
        id: "channel.signal.rpc",
        label: "Signal RPC",
        state: "unavailable",
        detail: "connection refused",
        required: true,
        channel: "signal",
        checkedAt: new Date(1_700_000_000_000).toISOString(),
        checkedAtMs: 1_700_000_000_000,
      },
    ],
    reasons: ["Signal RPC: connection refused"],
  };

  const server = new BridgeHttpServer({
    port: 0,
    healthReporter: staticHealthReporter(snapshot),
  });

  await server.start();
  try {
    const healthz = await requestText(server.listeningPort, "/healthz", "GET");
    assert.equal(healthz.statusCode, 200);
    assert.match(healthz.body, /"ok":true/);

    const readyz = await requestText(server.listeningPort, "/readyz", "GET");
    assert.equal(readyz.statusCode, 503);
    assert.match(readyz.body, /"ready":false/);
    assert.match(readyz.body, /Signal RPC: connection refused/);
  } finally {
    await server.stop();
  }
});
