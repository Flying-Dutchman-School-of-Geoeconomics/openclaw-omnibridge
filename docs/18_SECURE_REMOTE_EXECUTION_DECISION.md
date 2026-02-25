# Secure Remote Execution Decision

## Problem

This runtime cannot execute Docker locally (`docker: command not found`).

## Decision

Use GitHub-hosted CI runners as the default execution bridge for Docker build/test.

Chosen path:

1. `.github/workflows/docker-remote.yml` executes Docker builds/tests remotely.
2. No SSH access to personal machines is granted.
3. No Docker socket mapping from local host to this runtime is used.

## Why This Is the Lowest-Exposure Option

1. No host-level control delegation:
   - SSH bridge exposes a reachable machine and credentials.
   - GitHub Actions uses ephemeral managed runners without persistent host access.

2. No local daemon exposure:
   - Docker socket mapping (`/var/run/docker.sock`) effectively grants root-equivalent host control to container workloads.
   - This solution avoids socket mapping entirely.

3. Least privilege in workflow:
   - Workflow permissions are `contents: read` only.
   - Checkout uses `persist-credentials: false`.
   - No deployment secrets are required for test execution.

4. Runtime hardening for tests:
   - Test container runs with `--network none`.
   - Linux capabilities dropped (`--cap-drop ALL`).
   - `no-new-privileges` enforced.
   - Resource limits (`--memory`, `--cpus`, `--pids-limit`, `--shm-size`) reduce abuse blast radius.

## Security Grounds for Belief

The proposed control set reduces attack surface at each trust boundary:

1. Credential boundary:
   - No SSH keys issued.
   - No host-level Docker socket grants.

2. Network boundary:
   - Test container cannot egress during execution (`--network none`).

3. Privilege boundary:
   - Minimal Linux privileges and no escalation path (`no-new-privileges`).

4. Persistence boundary:
   - GitHub-hosted runner is ephemeral; filesystem is discarded post-job.

Given these controls, compromise of the test container does not provide direct access to the device running this assistant.

## Residual Risk

1. Supply-chain risk during image build (`npm install` without lockfile).
2. CI service trust assumptions (GitHub-hosted runner integrity).
3. Repository write access by maintainers remains a governance risk.

## Mitigations to Apply Next

1. Commit `package-lock.json` and enforce `npm ci` only.
2. Protect `main` branch and require review for workflow changes.
3. Add dependency scanning (e.g., `npm audit` or SCA tool) in CI.
4. Keep secret-scoped workflows separate from test-only workflows.
