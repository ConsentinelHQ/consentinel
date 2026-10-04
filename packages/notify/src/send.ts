/**
 * The only place that talks to Resend. Reply-to and List-Unsubscribe go on every
 * message when REPLY_TO_EMAIL is set: replies reach a person, and Gmail ranks
 * mail with an unsubscribe path higher than mail without one.
 */

const ENDPOINT = "https://api.resend.com/emails";

export type SendResult = { sent: true } | { sent: false; reason: string };

export interface SendInput {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not configured" };
  if (input.to.length === 0) return { sent: false, reason: "no recipients" };

  const replyTo = process.env["REPLY_TO_EMAIL"];
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...input,
        ...(replyTo
          ? {
              reply_to: replyTo,
              headers: { "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>` },
            }
          : {}),
      }),
    });
    if (!response.ok) return { sent: false, reason: `Resend returned ${String(response.status)}` };
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "send failed" };
  }
}
