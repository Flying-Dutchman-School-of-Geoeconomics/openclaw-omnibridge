import type { RedisClientType } from "redis";
import { IdempotencyStore, RateLimiter, ReplayStore } from "./types.js";

const secondsFromMs = (ttlMs: number): number => Math.max(1, Math.ceil(ttlMs / 1000));

export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly keyPrefix: string,
    private readonly ttlMs: number,
  ) {}

  async hasProcessed(messageId: string): Promise<boolean> {
    const key = `${this.keyPrefix}:idempotency:${messageId}`;
    return (await this.client.exists(key)) === 1;
  }

  async markProcessed(messageId: string): Promise<void> {
    const key = `${this.keyPrefix}:idempotency:${messageId}`;
    await this.client.set(key, "1", {
      EX: secondsFromMs(this.ttlMs),
    });
  }
}

export class RedisReplayStore implements ReplayStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly keyPrefix: string,
  ) {}

  async markIfNew(key: string, ttlMs: number): Promise<boolean> {
    const redisKey = `${this.keyPrefix}:replay:${key}`;
    const result = await this.client.set(redisKey, "1", {
      PX: ttlMs,
      NX: true,
    });
    return result === "OK";
  }
}

export class RedisSlidingWindowRateLimiter implements RateLimiter {
  constructor(
    private readonly client: RedisClientType,
    private readonly keyPrefix: string,
    private readonly perMinute: number,
  ) {}

  async allow(subject: string, nowMs: number): Promise<boolean> {
    const window = Math.floor(nowMs / 60_000);
    const redisKey = `${this.keyPrefix}:ratelimit:${subject}:${window}`;
    const count = await this.client.incr(redisKey);

    if (count === 1) {
      await this.client.expire(redisKey, 61);
    }

    return count <= this.perMinute;
  }
}
