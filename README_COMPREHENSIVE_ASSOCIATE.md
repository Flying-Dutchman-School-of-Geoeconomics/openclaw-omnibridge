# Comprehensive Reviewer README

## 1. Scope of This Package

This package is the complete handoff unit for OpenClaw OmniBridge. It includes:

1. Source implementation.
2. Manuals and specifications.
3. Tests and CI workflows.
4. Containerized execution paths.
5. Security decision records.
6. MPL-2.0 licensing alignment.

## 2. Directory Map

1. `src/` implementation.
2. `tests/` unit/integration-style tests.
3. `docs/` manuals and runbooks.
4. `specs/` formal and handoff specifications.
5. `.github/workflows/` CI workflows.
6. `Dockerfile`, `docker-compose*.yml` container paths.

## 3. Primary Start Files

1. `README.md`
2. `docs/MASTER_MANUAL.md`
3. `docs/02_INSTALLATION_MASTER_MANUAL.md`
4. `docs/16_FASTIFY_NEST_INGRESS_MANUAL.md`
5. `docs/17_NODELESS_DOCKER_TESTING.md`
6. `docs/18_SECURE_REMOTE_EXECUTION_DECISION.md`

## 4. Installation and Verification Paths

### Path A: Minimum Exposure (Recommended)

Run Docker build/test remotely on GitHub-hosted runners.

1. Push branch or open PR.
2. Confirm workflow runs:
   - `.github/workflows/ci.yml`
   - `.github/workflows/docker-remote.yml`
3. Validate successful jobs:
   - build/unit test pass
   - redis integration pass
   - docker tester pass
   - ingress artifact checks pass

Why this is recommended:

1. No SSH keys granted.
2. No host Docker socket mapped.
3. Ephemeral CI runners reduce host exposure.

### Path B: Local Node-less Docker

Prerequisite: Docker engine installed locally.

1. `cp .env.docker.example .env`
2. `docker compose up --build openclaw-test`
3. For Nest ingress runtime check:
   - `docker compose --profile nest up --build openclaw-nest`

Optional GPU for Ollama:

1. `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build openclaw-test`

### Path C: Local Node Runtime

Prerequisite: Node.js 20+ and npm.

1. `cp .env.example .env`
2. `npm install`
3. `npm run build`
4. `npm test`
5. `npm run start:fastify` or `npm run start:nest`

## 5. What to Verify

### Functional

1. Ingress endpoints exist and route correctly.
2. Bridge engine enforces authentication/policy/replay/idempotency.
3. Channel adapters normalize payloads and gate unauthorized senders/commands.

### Security

1. Raw-body-safe webhook handling is present for signed providers.
2. `docker-remote.yml` is least-privilege (`contents: read`).
3. Test container hardening flags are active (`--network none`, `--cap-drop ALL`, `no-new-privileges`).
4. Security rationale is documented in `docs/18_SECURE_REMOTE_EXECUTION_DECISION.md`.

### Documentation Completeness

1. Installation manuals for all channels present.
2. Cryptographic and formal manuals present.
3. Handoff specs exist for constrained/unimplemented externals.

## 6. Upload Checklist

Before upload, confirm:

1. `COVERNOTE_ASSOCIATE.md` included.
2. `README_COMPREHENSIVE_ASSOCIATE.md` included.
3. `README.md` and all `docs/` files included.
4. `src/`, `tests/`, `specs/`, `.github/workflows/` included.
5. `Dockerfile` and compose files included.

## 7. Suggested Upload Procedure

1. Unzip in a clean directory.
2. Run one verification path (A preferred, or B/C).
3. Attach workflow logs or test logs as review evidence.
4. Upload full package plus verification evidence.

## 8. Known Constraints

1. Signal and Email production hardening still have explicit specifications for follow-on coding agents.
2. In this assistant runtime, local `node`/`npm` and `docker` are not available; execution guidance is provided for external verification environments.

## 9. Final Reviewer Sign-off Template

- Reviewer name:
- Date:
- Verification path used (A/B/C):
- Result:
- Notes / defects found:
- Upload completed (yes/no):
