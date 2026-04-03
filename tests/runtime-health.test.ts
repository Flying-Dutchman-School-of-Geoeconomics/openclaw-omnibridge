import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeHealthMonitor } from "../src/reliability/runtime-health.js";

test("RuntimeHealthMonitor derives readiness and channel degradation from dependency probes", async () => {
  const monitor = new RuntimeHealthMonitor({
    refreshIntervalMs: 0,
    channelDependencies: {
      signal: ["bootstrap.policy", "channel.signal.rpc"],
      status: ["bootstrap.policy", "channel.status.waku"],
    },
    probes: [
      {
        id: "bootstrap.policy",
        label: "policy bootstrap",
        run: async () => ({
          state: "healthy",
          detail: "policy path readable",
        }),
      },
      {
        id: "channel.signal.rpc",
        label: "Signal RPC",
        channel: "signal",
        run: async () => ({
          state: "unavailable",
          detail: "connection refused",
        }),
      },
      {
        id: "channel.status.waku",
        label: "Status Waku",
        channel: "status",
        run: async () => ({
          state: "healthy",
          detail: "Waku client connected",
        }),
      },
    ],
  });

  await monitor.start();
  try {
    const snapshot = monitor.readyz();
    assert.equal(snapshot.ready, false);
    assert.equal(monitor.isChannelHealthy("status"), true);
    assert.equal(monitor.isChannelHealthy("signal"), false);
    assert.equal(monitor.channelReason("signal"), "Signal RPC: connection refused");
    assert.match(snapshot.reasons.join(" "), /Signal RPC: connection refused/);
  } finally {
    await monitor.stop();
  }
});

test("RuntimeHealthMonitor treats channels without explicit dependencies as healthy by default", async () => {
  const monitor = new RuntimeHealthMonitor({
    refreshIntervalMs: 0,
    probes: [
      {
        id: "bootstrap.policy",
        label: "policy bootstrap",
        run: async () => ({
          state: "healthy",
          detail: "default policy loaded",
        }),
      },
    ],
  });

  await monitor.start();
  try {
    assert.equal(monitor.isChannelHealthy("telegram"), true);
    assert.equal(monitor.channelReason("telegram"), undefined);
    assert.equal(monitor.readyz().ready, true);
  } finally {
    await monitor.stop();
  }
});
