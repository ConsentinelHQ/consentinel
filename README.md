# Consentinel

Consent and tag governance scanner. Two-pass (consent-off / consent-on) Playwright scan, signature-based tracker classification, evidence-backed findings.

## Layout

- `apps/web` - Next.js: marketing, free scanner, dashboard (Vercel)
- `apps/scanner` - long-running worker: Playwright + BullMQ (container, never serverless)
- `packages/shared` - `Finding` / `ScanResult` schema and pure helpers. The contract everything speaks.

## Local setup

```sh
nvm use            # Node 22
corepack enable    # pnpm 9
pnpm install       # also installs git hooks
cp .env.example .env
pnpm --filter @consentinel/scanner exec playwright install chromium
pnpm typecheck && pnpm test && pnpm lint
```

## Rules of the repo

- Strict TypeScript. No `any` without a comment saying why.
- Nothing merges red. CI runs format, lint, typecheck, test, build, and a dependency audit on every PR.
- Conventional Commits (`feat:`, `fix:`, `chore:`). Enforced on commit.
- Secrets live in `.env*` (ignored) locally and the host secret store in prod. Never in code.
- DB changes go through migrations only.

## CI

`.github/workflows/ci.yml` runs three jobs: `check` (web + shared), `scanner` (Playwright, cached Chromium, Docker build), `audit`.
Vercel deploys `apps/web` on merge to `main` via the GitHub integration. The scanner image is built in CI and deployed by the host on merge.
