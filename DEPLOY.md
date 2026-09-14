# Consentinel - production deploy runbook

One to two sittings. Do the steps in order; each one is a dependency of the next.

Target state: public URL on Vercel, hosted worker on Render, managed Redis, separate
staging and production Neon branches, Sentry in both apps.

---

## 0. Pre-flight

The funnel is not on `main` yet. Nothing below works without it.

```bash
git checkout main && git pull
# squash-merge the report/bot-protection/severity branch, CI green
pnpm install && pnpm -r typecheck && pnpm -r lint && pnpm -r test
```

Verify `apps/web/src/app/api/report/route.ts` and `apps/web/src/lib/email.ts` exist on
`main`. If they do not, stop.

---

## 1. Neon - environment separation

One database serving dev and prod is an outage waiting to happen. Neon branches are
copy-on-write, so this costs nothing.

1. In the Neon console, branch `production` and `staging` off the current dev branch.
2. Copy both connection strings. Each has two forms:
   - direct: `...neon.tech/consentinel` - migrations and the worker
   - pooled: `...-pooler.neon.tech/consentinel` - Next.js route handlers only
3. Run migrations against production from your machine, once:

```bash
DATABASE_URL="<production direct url>" pnpm --filter @consentinel/db migrate
```

Serverless route handlers open a connection per invocation. Pointing them at the direct
URL will exhaust Postgres connections under any real traffic. The pooled URL is not
optional.

---

## 2. Redis - managed queue backing

BullMQ holds a blocking connection open. That interacts badly with per-command pricing.

**Recommended:** Render Key Value instance in the same region as the worker. Same
dashboard, private networking, no per-command billing, no cross-region latency on every
queue poll.

**If you use Upstash instead:** the free tier's daily command cap will be consumed by
BullMQ's blocking polls alone, before a single user scans anything. Go pay-as-you-go and
use the `rediss://` URL, not `redis://`. TLS is mandatory there and the scheme is the
only thing that turns it on.

Whichever you pick, confirm the client config:

```ts
// BullMQ requires this. A default-configured ioredis will drop jobs against a managed host.
{ maxRetriesPerRequest: null, enableReadyCheck: false }
```

---

## 3. Worker - Render private service

The Dockerfile exists and builds in CI. Three settings people get wrong on a monorepo:

| Setting              | Value                                                               |
| -------------------- | ------------------------------------------------------------------- |
| Service type         | Private Service (no public port, nothing should reach it directly)  |
| Docker build context | `.` (repo root - the Dockerfile copies `pnpm-lock.yaml` from there) |
| Dockerfile path      | `apps/scanner/Dockerfile`                                           |
| Instance             | Standard, 2GB RAM minimum                                           |
| Region               | Same as the Redis instance                                          |

Chromium will not start in 512MB. A starved worker does not error cleanly, it hangs and
times out, and you will spend an evening blaming the queue.

Set `SCAN_CONCURRENCY=1` on the first deploy. Raise it only after you have watched memory
under two simultaneous real scans.

---

## 4. Web - Vercel

1. New project, root directory `apps/web`, framework Next.js.
2. Build command `pnpm turbo run build --filter=@consentinel/web...` so workspace
   packages build first.
3. Add production env vars from the matrix below.
4. Wire the GitHub repo to auto-deploy `main`. Preview deploys point at the **staging**
   Neon branch and the **staging** Redis, never production.

---

## 5. Environment matrix

| Variable                         | Vercel (web)      | Render (worker)   | Notes                        |
| -------------------------------- | ----------------- | ----------------- | ---------------------------- |
| `DATABASE_URL`                   | -                 | production direct | Worker writes findings       |
| `DATABASE_URL_POOLED`            | production pooled | -                 | Route handlers only          |
| `REDIS_URL`                      | production        | production        | Same instance, both sides    |
| `SCAN_CONCURRENCY`               | -                 | `1`               | Raise after watching memory  |
| `SCAN_TIMEOUT_MS`                | -                 | `90000`           |                              |
| `SCAN_MAX_ATTEMPTS`              | -                 | `3`               |                              |
| `ALLOW_PRIVATE_SCAN_TARGETS`     | `false`           | `false`           | **See below**                |
| `SENTRY_DSN`                     | set               | set               | Separate projects, same org  |
| `RESEND_API_KEY`                 | set               | -                 | Web sends the report         |
| `REPORT_FROM_EMAIL`              | set               | -                 | Must be on a verified domain |
| `TURNSTILE_SECRET_KEY`           | set               | -                 |                              |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | set               | -                 |                              |

`ALLOW_PRIVATE_SCAN_TARGETS` disables the SSRF guard. It exists for local fixtures. If it
is truthy in production, anyone can point your worker at `169.254.169.254` and read your
cloud metadata. Set it explicitly to `false` in both places and check it again after the
first deploy, not before.

---

## 6. Observability - before the first stranger

Non-negotiable. Without this, a failed scan is invisible.

1. Sentry projects for `web` and `scanner`. DSNs into both environments.
2. Replace `console.log` with pino. One decision makes this worth doing: generate a
   `jobId` at enqueue, pass it through the queue payload, and include it in every log
   line and every Sentry scope on both sides. A scan then traces end to end from the
   POST to the finding write.
3. Render health check on the worker. A dead worker with a filling queue looks identical
   to a slow one from the outside.

---

## 7. Smoke test - definition of done

From the public URL, not localhost:

1. Scan a real site with a CMP. Findings return, severities are tiered.
2. Submit the email gate. Report arrives in the inbox.
3. Scan a site with no trackers. Headline reads clean, no invented findings.
4. Submit `http://localhost:3000` as a target. It must be rejected by the SSRF guard.
5. Force a worker error. It appears in Sentry with the job ID.
6. Find that same scan in the logs by job ID alone, from POST to write.

All six pass, M3 is unlocked.

---

## 8. What this deliberately does not do

Deploying is not launching. Do not point traffic, content, or outbound at the public URL
until the signature library clears its gate: 50+ request signatures, 20 real sites
scanned, zero known false negatives on those 20.

A scan that reports "0 trackers" on a site full of them is one credibility loss with a
buyer you only get once.
