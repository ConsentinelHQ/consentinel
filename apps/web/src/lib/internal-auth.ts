import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Bearer check for /api/internal routes. OUTREACH_API_KEY unset (or short)
 * means every internal route is off and answers 404.
 */
export function internalAuthorized(request: Request): boolean {
  const key = process.env["OUTREACH_API_KEY"];
  if (!key || key.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
