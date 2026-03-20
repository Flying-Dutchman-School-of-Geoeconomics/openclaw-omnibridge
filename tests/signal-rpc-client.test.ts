import assert from "node:assert/strict";
import test from "node:test";
import { SignalRpcClient } from "../src/channels/signal/rpc-client.js";

test("SignalRpcClient.sendMessage targets /api/v1/rpc with JSON-RPC 2.0 shape", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: unknown;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = input.toString();
    capturedBody = JSON.parse((init?.body as string) ?? "{}");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const client = new SignalRpcClient("http://127.0.0.1:8081");
    await client.sendMessage("+15551234567", "HELLO_STATUS_TO_SIGNAL");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(capturedUrl, "http://127.0.0.1:8081/api/v1/rpc");

  const body = capturedBody as Record<string, unknown>;
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.method, "send");

  const params = body.params as Record<string, unknown>;
  assert.deepEqual(params.recipient, ["+15551234567"]);
  assert.equal(params.message, "HELLO_STATUS_TO_SIGNAL");
});

test("SignalRpcClient.sendMessage throws on non-ok response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("Not Found", { status: 404 });
  };

  try {
    const client = new SignalRpcClient("http://127.0.0.1:8081");
    await assert.rejects(
      () => client.sendMessage("+15551234567", "HELLO"),
      /Signal sendMessage failed: 404/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
