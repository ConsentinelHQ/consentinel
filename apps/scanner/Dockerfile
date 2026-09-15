# Scanner worker: long-running Node + Playwright service. Never serverless.
# Playwright base image pins Chromium to the matching library version.
ARG PLAYWRIGHT_VERSION=1.56.0
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/notify/package.json packages/notify/
COPY apps/scanner/package.json apps/scanner/
RUN pnpm install --frozen-lockfile --filter @consentinel/scanner...

FROM deps AS build
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/queue packages/queue
COPY packages/notify packages/notify
COPY apps/scanner apps/scanner
RUN pnpm --filter @consentinel/scanner... build
RUN pnpm --filter @consentinel/scanner --prod deploy /out

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
# Playwright image runs as root by default; drop privileges. Browser is sandboxed at the OS level.
USER pwuser
# Long-running worker process. Reads the scan queue, writes findings to Postgres.
CMD ["node", "dist/main.js"]
