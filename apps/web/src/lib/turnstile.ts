import "server-only";

/**
 * Cloudflare Turnstile verification.
 *
 * IP rate limiting stops a careless script, not a determined one - rotating IPs is
 * trivial and each scan costs us a browser launch. This is the actual cost defense
 * on a public form.
 *
 * When no secret is configured we skip verification so local development works
 * without an account. That’s safe only because production sets the secret; the
 * deploy checklist treats a missing secret as a misconfiguration.
 */
const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<TurnstileResult> {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return { ok: true };

  if (!token) return { ok: false, reason: "missing challenge response" };

  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const response = await fetch(ENDPOINT, { method: "POST", body });
    const data = (await response.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "challenge failed" };
  } catch {
    // Fail closed: if we can’t verify, we don’t spend a browser launch.
    return { ok: false, reason: "couldn’t verify challenge" };
  }
}
