# Signal Installation and Hardening Guide

## 1. Important Context

Signal does not provide a public cloud bot API analogous to Slack/Discord. Typical automation bridges rely on a self-hosted `signal-cli` runtime.

## 2. Prerequisites

1. Deploy `signal-cli` or compatible REST wrapper.
2. Register Signal number and link device.
3. Restrict runtime to private network.

## 3. Configure Environment

- `SIGNAL_ENABLED=true`
- `SIGNAL_RPC_URL=http://127.0.0.1:8080`
- `SIGNAL_TRUSTED_PEERS=+1555..., +1444...`

## 4. Verification Controls

Code path:

- `src/channels/signal/adapter.ts`
- `src/crypto/verifiers.ts` (`verifySignalTrustBoundary`)

Current trust model:

1. Sender allowlisting via `SIGNAL_TRUSTED_PEERS`.
2. Assumes trusted local daemon boundary.

Required production upgrade (SPECIFICATION):

1. Add mTLS between bridge and signal daemon.
2. Add daemon identity attestation and startup integrity checks.

See:

- `specs/signal/SIGNAL_RPC_ADAPTER_SPEC.md`

## 5. Send Path

- `src/channels/signal/rpc-client.ts`
- Endpoint currently assumes `/v2/send`; verify against deployed signal-cli REST version.

## 6. Test Cases

1. Trusted peer message accepted.
2. Untrusted peer rejected.
3. Daemon unreachable raises audited error.

## 7. Official Sources

- signal-cli: [https://github.com/AsamK/signal-cli](https://github.com/AsamK/signal-cli)
- Signal docs: [https://signal.org/docs/](https://signal.org/docs/)
