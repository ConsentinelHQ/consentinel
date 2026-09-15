import { z } from "zod";

// Validate env at boot and fail fast. A worker with a missing URL must not start
// and silently process nothing.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  SCAN_CONCURRENCY: z.coerce.number().int().positive().default(2),
  SCAN_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  // Below this many requests a page did not really load. Lowered only by tests,
  // whose fixtures are deliberately tiny.
  SCAN_MIN_REQUESTS: z.coerce.number().int().positive().default(12),
  // Used to build links in alert emails. No trailing slash.
  APP_URL: z.string().url().default("https://www.consentinelhq.com"),
  SCAN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  /** Fixtures and local dev only. Never true in production - see safety.ts. */
  ALLOW_PRIVATE_SCAN_TARGETS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type ScannerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ScannerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid scanner configuration - ${issues}`);
  }
  return parsed.data;
}
