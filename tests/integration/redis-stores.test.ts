import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "redis";
import {
  RedisIdempotencyStore,
  RedisReplayStore,
  RedisSlidingWindowRateLimiter,
  type RedisKvClient,
} from "../../src/core/redis-stores.js";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  test("redis integration tests skipped when REDIS_URL is missing", { skip: true }, () => {});
} else {
  test("redis replay/idempotency/rate-limit stores enforce expected behavior", async () => {
    const keyPrefix = `openclaw-test-${Date.now()}`;
    const client = createClient({ url: redisUrl });
    await client.connect();

    const kvClient = client as unknown as RedisKvClient;

    const replayStore = new RedisReplayStore(kvClient, keyPrefix);
    const idempotencyStore = new RedisIdempotencyStore(kvClient, keyPrefix, 5_000);
    const rateLimiter = new RedisSlidingWindowRateLimiter(kvClient, keyPrefix, 2);

    const first = await replayStore.markIfNew("nonce-1", 10_000);
    const second = await replayStore.markIfNew("nonce-1", 10_000);
    assert.equal(first, true);
    assert.equal(second, false);

    const beforeMark = await idempotencyStore.hasProcessed("m-1");
    await idempotencyStore.markProcessed("m-1");
    const afterMark = await idempotencyStore.hasProcessed("m-1");
    assert.equal(beforeMark, false);
    assert.equal(afterMark, true);

    const now = Date.now();
    const allow1 = await rateLimiter.allow("alice", now);
    const allow2 = await rateLimiter.allow("alice", now + 100);
    const allow3 = await rateLimiter.allow("alice", now + 200);
    assert.equal(allow1, true);
    assert.equal(allow2, true);
    assert.equal(allow3, false);

    const keys = await client.keys(`${keyPrefix}:*`);
    if (keys.length > 0) {
      await client.del(keys);
    }
    await client.quit();
  });
}
