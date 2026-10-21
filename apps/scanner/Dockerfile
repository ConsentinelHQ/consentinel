# Scanner worker: long-running Node + Playwright service. Never serverless.
# Playwright base image pins Chromium to the matching library version.
ARG PLAYWRIGHT_VERSION=1.56.0
FROM debian:bookworm-slim AS nodebin
ARG TARGETARCH
ARG NODE_VERSION=22.23.4
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
 && case "$TARGETARCH" in \
      amd64) ARCH=x64;   SHA=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce ;; \
      arm64) ARCH=arm64; SHA=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b ;; \
      *) echo "unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac \
 && F=node-v${NODE_VERSION}-linux-${ARCH} \
 && curl -fsSLO https://nodejs.org/dist/v${NODE_VERSION}/${F}.tar.xz \
 && echo "${SHA}  ${F}.tar.xz" | sha256sum -c - \
 && tar -xJf ${F}.tar.xz -C /usr/local --strip-components=1 ${F}/bin/node

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS base
COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node
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
COPY --from=nodebin /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
# Playwright image runs as root by default; drop privileges. Browser is sandboxed at the OS level.
USER pwuser
# Long-running worker process. Reads the scan queue, writes findings to Postgres.
CMD ["node", "dist/main.js"]
