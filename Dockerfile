# syntax=docker/dockerfile:1

# Multi-stage Dockerfile for Node-less hosts.
# - `tester` target runs test pipeline with dev dependencies.
# - `runner` target is the lean runtime image.

FROM node:20-alpine AS base
WORKDIR /app
ENV CI=true \
    npm_config_audit=false \
    npm_config_fund=false \
    NODE_OPTIONS=--max-old-space-size=512

FROM base AS deps
COPY package*.json ./
# Use lockfile when present; fallback to npm install when lockfile is absent.
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM deps AS tester
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY docs ./docs
COPY specs ./specs
CMD ["npm", "test"]

FROM base AS runner
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/src/ingress/fastify/main.js"]
