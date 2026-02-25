# Node-Less Docker Testing Guide

This guide remedies environments where local `node` and `npm` are unavailable.

## 1. Files Added for This Flow

1. `Dockerfile` (multi-stage: `deps`, `build`, `tester`, `runner`)
2. `docker-compose.yml` (OpenClaw test runner + Ollama + Gemini env wiring)
3. `docker-compose.gpu.yml` (optional Ollama GPU override)
4. `.env.docker.example` (minimal Docker-oriented environment)

## 2. Build and Test Without Node/npm

Preferred minimum-exposure path:

1. Push branch / open PR.
2. Let `.github/workflows/docker-remote.yml` run Docker remotely on ephemeral runners.

Local Docker path (when you control the host):

```bash
cp .env.docker.example .env
docker compose up --build openclaw-test
```

Alternative explicit commands:

```bash
docker build --target tester -t openclaw-omnibridge:tester .
docker run --rm --shm-size=2gb openclaw-omnibridge:tester
```

Redis-backed integration (cluster-state simulation):

```bash
STORE_BACKEND=redis REDIS_URL=redis://redis:6379 docker compose --profile infra up --build openclaw-test
```

Node-less Nest ingress startup (equivalent to `npm run build && npm run start:nest`):

```bash
docker compose --profile nest up --build openclaw-nest
```

## 3. End-to-End With Ollama and Gemini

1. Ollama is provided as a local container (`ollama`).
2. `ollama-puller` preloads `${OLLAMA_MODEL}`.
3. Gemini is cloud-based; pass `GEMINI_API_KEY` via environment.

Example:

```bash
GEMINI_API_KEY=your_key docker compose up --build openclaw-test
```

## 4. Resource-Constrained Recommendations

1. Keep `--shm-size=2gb` for browser-adjacent test workloads.
2. Use default service limits in compose (`mem_limit: 2g`, `cpus: 1.50`) as baseline.
3. Reduce Ollama model size via `OLLAMA_MODEL` for low-memory hosts.

## 5. GPU Acceleration for Ollama (Optional)

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build openclaw-test
```

## 6. Security Notes

1. Treat `.env` as sensitive when it contains API keys.
2. Pin dependencies via `package-lock.json` when available for deterministic installs.
3. Keep model and test data volumes local and access-controlled.
