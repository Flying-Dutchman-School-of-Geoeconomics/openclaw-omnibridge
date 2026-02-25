import { IdempotencyStore, RateLimiter, ReplayStore } from "./types.js";

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly processed = new Set<string>();

  async hasProcessed(messageId: string): Promise<boolean> {
    return this.processed.has(messageId);
  }

  async markProcessed(messageId: string): Promise<void> {
    this.processed.add(messageId);
  }
}

export class InMemoryReplayStore implements ReplayStore {
  private readonly nonces = new Map<string, number>();

  async markIfNew(key: string, ttlMs: number): Promise<boolean> {
    const nowMs = Date.now();
    for (const [nonce, expiresMs] of this.nonces.entries()) {
      if (expiresMs <= nowMs) {
        this.nonces.delete(nonce);
      }
    }

    if (this.nonces.has(key)) {
      return false;
    }
    this.nonces.set(key, Date.now() + ttlMs);
    return true;
  }
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, { windowStartMs: number; count: number }>();

  constructor(private readonly perMinute: number) {}

  async allow(subject: string, nowMs: number): Promise<boolean> {
    const current = this.counters.get(subject);
    if (!current || nowMs - current.windowStartMs >= 60_000) {
      this.counters.set(subject, { windowStartMs: nowMs, count: 1 });
      return true;
    }

    if (current.count >= this.perMinute) {
      return false;
    }

    current.count += 1;
    return true;
  }
}
