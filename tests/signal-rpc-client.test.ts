import assert from "node:assert/strict";
import test from "node:test";
import { SignalRpcClient } from "../src/channels/signal/rpc-client.js";

test("SignalRpcClient probeSendSurface verifies the expected /v2/send endpoint", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: unknown;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    capturedUrl = input.toString();
    capturedBody = JSON.parse((init?.body as string) ?? "{}");
    return new Response("Bad Request", { status: 400 });
  };

  try {
    const client = new SignalRpcClient("http://127.0.0.1:8081");
    const result = await client.probeSendSurface();

    assert.equal(capturedUrl, "http://127.0.0.1:8081/v2/send");
    assert.deepEqual(capturedBody, {});
    assert.deepEqual(result, {
      state: "healthy",
      detail: "Signal send endpoint reachable and validating payloads",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("SignalRpcClient probeSendSurface degrades when the expected endpoint is missing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => new Response("Not Found", { status: 404 });

  try {
    const client = new SignalRpcClient("http://127.0.0.1:8081");
    const result = await client.probeSendSurface();

    assert.deepEqual(result, {
      state: "unavailable",
      detail: "expected /v2/send endpoint not found",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
