# Worker image: Playwright + Lighthouse in a container with pinned Chromium
# Per §13.2: "containerized with pinned Chromium version"
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/worker/package.json packages/worker/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspace=packages/worker --workspace=packages/shared

COPY packages/shared packages/shared
COPY packages/worker packages/worker
COPY tsconfig.base.json ./

# Default: poll loop mode (claims and runs queued tests)
CMD ["npx", "tsx", "packages/worker/src/poll-loop.ts"]
