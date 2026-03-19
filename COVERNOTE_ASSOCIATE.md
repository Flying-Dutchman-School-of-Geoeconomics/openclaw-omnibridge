# OpenClaw OmniBridge — Associate Cover Note
## v6 Baseline: Status → Signal Hello Proof

**Branch:** `codex/status-signal-v6-baseline`
**Date:** March 2026
**Validated on:** Windows 11, Node.js v24.14.0, Java 25.0.2 Temurin, signal-cli 0.14.1

---

## What This Branch Proves

This branch captures the v6-level working baseline for the OpenClaw OmniBridge
Status → Signal hello route. The following was proven in a live experiment on
15 March 2026:

1. **Configuration truth** — `GET /offers.txt` shows `Status -> Signal: active`
   and `Signal -> Status: active` when the bridge is started with the correct
   policy file.

2. **Bridge-routing truth** — The bridge's audit log shows `accepted` (with
   mechanism `status-bridge-shim-local-signed-payload`) and `forwarded from
   status to signal` for a message injected via the local Status inject path.

3. **Human-visible endpoint truth** — `HELLO_STATUS_TO_SIGNAL` was received
   as a text message on Signal device +RECIPIENT_NUMBER (redacted). Delivery
   receipts and a read receipt were confirmed in the signal-cli daemon log.

---

## Three Proof Levels (Formal Vocabulary)

| Level | How to Verify | What It Proves |
|---|---|---|
| 1: Configuration truth | `GET /offers.txt` | Bridge knows about the route |
| 2: Bridge-routing truth | Audit log: accepted + forwarded | Bridge processed and dispatched |
| 3: Human-visible truth | Signal device shows message | Delivered to a real person |

---

## What is Intentionally Out of Scope

**Native Status Desktop rendering (W-15):** The bridge can forward a Signal
message toward Status at the bridge-routing level (Level 2), and the audit log
will show `forwarded from signal to status`. However, the forwarded message does
not currently appear in the native Status Desktop chat interface. This is because
the bridge publishes a signed JSON envelope format while Status Desktop expects
native Status protocol protobuf messages. This is a formally deferred workstream
and is not claimed as solved by this branch.

**Waku light-node propagation:** The `StatusHumanIngressShim` (network publish
path) was shown to be unreliable for local hello proof purposes. The hello proof
uses the deterministic local inject path instead. Waku propagation between
separate light nodes remains a separate investigation.

---

## How to Verify Locally

```bash
# 1. Install dependencies
npm install

# 2. Build
npm run build

# 3. Run unit tests — expect 35/35 passing
npm run test:unit

# 4. Create your .env from the example
cp .env.status-signal-hello.example .env
# Fill in your real values

# 5. Create your policy file
cp config/policy.status-signal-hello.example.json config/policy.json
# Fill in your real values

# 6. Derive your STATUS_ALLOWED_SENDERS value (Ed25519 key)
node --env-file=.env -e "import('./dist/src/channels/status/waku-proof.js').then(m => { console.log(m.deriveStatusPublicKeyHex(process.env.STATUS_PRIVATE_KEY_HEX)); })"

# 7. Start signal-cli daemon (separate terminal, keep running)
signal-cli.bat -a +BRIDGE_NUMBER daemon --http 127.0.0.1:8081

# 8. Start the bridge (separate terminal)
node --env-file=.env dist/src/index.js

# 9. Verify routes
# Open browser: http://localhost:8080/offers.txt
# Should show: Status -> Signal: active

# 10. Send the hello
curl -X POST http://127.0.0.1:8080/internal/status-shim/messages \
  -H "Content-Type: application/json" \
  -H "x-openclaw-status-shim-secret: YOUR_SHARED_SECRET" \
  -d '{"text":"HELLO_STATUS_TO_SIGNAL"}'

# 11. Verify in audit log
# Expected: accepted (status) + forwarded (signal)
cat var/audit.log
```

---

## Key Technical Notes

### STATUS_ALLOWED_SENDERS — Ed25519 vs secp256k1

The same private key bytes produce **different** public keys under different
cryptographic algorithms:

- **secp256k1** (ethers.js): Used for Status community and chat IDs.
  Example shape: `0x03f77a117f03d7fe...`
- **Ed25519** (bridge signing): Used for Status message signing in `waku-proof.ts`.
  Example shape: `4f8a6fe5f21313cc...` (no 0x prefix)

`STATUS_ALLOWED_SENDERS` must contain the **Ed25519** key.
Derive it with `deriveStatusPublicKeyHex()` as shown in step 6 above.

### Signal RPC Endpoint

signal-cli 0.14.1 uses JSON-RPC 2.0 over `POST /api/v1/rpc`, not a REST
`/v2/send` endpoint. The bridge's `src/channels/signal/rpc-client.ts` has
been updated accordingly.

### Waku Fixes — Now Permanent in Source

Four Waku SDK compatibility fixes that previously required manual reapplication
to `dist/` after every build have been moved permanently into
`src/channels/status/waku-client.ts`. They now compile in automatically.

---

## Security and Redaction Notes

The following material has been intentionally kept out of this repository:

- Real `STATUS_PRIVATE_KEY_HEX` values
- Real `STATUS_SHIM_SHARED_SECRET` values
- Real Signal phone numbers
- Real community IDs or chat IDs from personal environments
- Raw audit logs with personal identifiers
- Screenshots from Signal device, bridge console, or Status Desktop
- Unredacted session transcripts

Example configuration files use placeholder values only. See
`.env.status-signal-hello.example` and
`config/policy.status-signal-hello.example.json`.

---

## Deferred Workstreams

| Workstream | Status |
|---|---|
| Native Status Desktop rendering (W-15) | Deferred — separate engineering track |
| Waku light-node propagation reliability | Deferred — not required for hello proof |
| Common Knowledge text refinements (plan items 10-13) | Deferred — second pass |
| Larger-string payload ladder tests | Future branch |
| Full bidirectional hello (Signal → Status visible in app) | Future branch |
