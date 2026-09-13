import "server-only";
import { redis } from "./server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in Redis. Scanning is the cost centre - a browser launch per
 * request - so the free tier has to be defended or a single script drains the worker
 * pool and the bill. Cheap and good enough; a sliding window is a later refinement.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = redis();
  const redisKey = `rl:${key}`;
  const count = await client.incr(redisKey);
  if (count === 1) await client.expire(redisKey, windowSeconds);
  const ttl = await client.ttl(redisKey);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

/** Best-effort client identity behind Vercel's proxy. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? ip : "unknown";
}
