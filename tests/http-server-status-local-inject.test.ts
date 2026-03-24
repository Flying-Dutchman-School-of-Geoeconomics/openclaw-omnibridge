import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { BridgeHttpServer } from "../src/server.js";

const requestJson = (
  port: number,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload).toString(),
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
    req.write(payload);
    req.end();
  });


const requestRaw = (
  port: number,
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-length": Buffer.byteLength(body).toString(),
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
    req.write(body);
    req.end();
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
    },
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
    },
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
    },
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

test("BridgeHttpServer rejects a local Status shim inject request with invalid JSON", async () => {
  const server = new BridgeHttpServer({
    port: 0,
    statusLocalIngress: {
      async injectHumanText(text: string) {
        return { messageId: "msg-1" };
      },
    },
    statusLocalIngressSharedSecret: "abcdefghijklmnopqrstuvwxyz012345",
  });

  await server.start();
  const address = (server as unknown as { server: { address(): { port: number } } }).server.address();
  const port = address.port;

  const result = await requestRaw(port, "/internal/status-shim/messages", "not valid json", {
    "content-type": "application/json",
    "x-openclaw-status-shim-secret": "abcdefghijklmnopqrstuvwxyz012345",
  });

  assert.equal(result.statusCode, 400);
  await server.stop();
});

test("BridgeHttpServer rejects a local Status shim inject request from non-loopback via predicate", () => {
  const isLoopback = (addr: string | undefined): boolean =>
    addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";

  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("::1"), true);
  assert.equal(isLoopback("::ffff:127.0.0.1"), true);
  assert.equal(isLoopback("192.168.1.100"), false);
  assert.equal(isLoopback("10.0.0.1"), false);
  assert.equal(isLoopback(undefined), false);
});
