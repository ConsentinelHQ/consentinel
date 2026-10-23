import { byProminence, joinNames, type Evidence } from "./evidence.js";

/**
 * The cold email, word for word from Charlie's template. Every claim in the
 * bullets comes straight from Evidence, so nothing here is model-written.
 */

const SITE = "https://www.getconsentinel.com/";

export interface Email {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateInput {
  domain: string;
  firstName: string;
  ev: Evidence;
  /** Optional footer line. Empty leaves it out. */
  postalAddress: string;
}

/** The deadline that makes this urgent: AB 566, effective January 1, 2027. */
const DEADLINE = "which every browser has to offer starting January 1";

export function stillFire(list: string[]): string {
  const n = list.length;
  const named = joinNames(byProminence(list).slice(0, 3));
  return n <= 3
    ? `${String(n)} ad vendors still fire: ${named}`
    : `${String(n)} ad vendors still fire, including ${named}`;
}

export function bullets(ev: Evidence): [string, string, string] {
  const vendors = stillFire(ev.firing);
  const plural = ev.gated === 1 ? "vendor correctly" : "vendors correctly";
  // evaluate() only names vendors that fired in both runs, so this is literal.
  const repeat = `We ran the scan twice and the same vendors fired both times, with ${String(ev.critical)} critical findings in total`;
  if (ev.mode === "rejected") {
    const gpc = ev.gpcIgnored ?? [];
    return [
      `After declining cookies, ${vendors}`,
      ev.gated > 0
        ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "waits" : "wait"} for consent, so the banner is working - these just aren't connected to it`
        : "None of the tags we saw changed behavior after the reject click",
      // The dated hook beats the repeat-run line when we have it.
      gpc.length >= MIN_GPC_BULLET
        ? `With Global Privacy Control on (the browser opt-out setting California requires sites to honor, ${DEADLINE}), ${stillFire(gpc)}`
        : repeat,
    ];
  }
  return [
    `With Global Privacy Control turned on (the browser opt-out signal California requires sites to honor, ${DEADLINE}), ${vendors}`,
    ev.gated > 0
      ? `${String(ev.gated)} other ${plural} ${ev.gated === 1 ? "stops" : "stop"}, so the signal is being read - these just aren't connected to it`
      : "None of them stopped when the signal was on",
    repeat,
  ];
}

/** One vendor ignoring GPC reads as a shrug; two is a pattern. */
const MIN_GPC_BULLET = 2;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function render({ domain, firstName, ev, postalAddress }: TemplateInput): Email {
  const greeting = `Hi ${firstName.trim() || "there"},`;
  const intro =
    "Sorry to bother, my name is Charlie Buckley - I'm the founder of Consentinel, a tool that checks whether websites actually respect their visitors' privacy choices.";
  const lead = `I wanted to reach out as I ran a scan on ${domain} and noticed several issues I wanted to make you aware of:`;
  const items = bullets(ev);
  const law =
    "This is the exact pattern behind a wave of lawsuits right now. Plaintiffs' firms are suing retailers under California's wiretap law (CIPA) when trackers fire after a visitor opts out, and regulators have fined Sephora $1.2M and Healthline $1.55M for not honoring opt-outs.";
  const offer =
    "I'd love to share the full report with you if you're interested. We also offer ongoing monitoring that rescans your site daily and alerts you if something new starts firing.";
  const close = "Happy to connect if interested - just wanted to make you aware of these gaps.";
  const sig = ["Thank you,", "Charlie Buckley", "Founder, Consentinel", "getconsentinel.com"];
  const optOut = "If you'd rather not hear from me, just reply and I won't email again.";

  const text = [
    greeting,
    "",
    intro,
    "",
    lead,
    "",
    ...items.map((i) => `- ${i}`),
    "",
    law,
    "",
    offer,
    "",
    close,
    "",
    ...sig,
    "",
    optOut,
    ...(postalAddress.trim() ? [postalAddress.trim()] : []),
  ].join("\n");

  const p = (s: string): string => `<p>${s}</p>`;
  const html = [
    p(esc(greeting)),
    p(esc(intro).replace("Consentinel", `<a href="${SITE}">Consentinel</a>`)),
    p(esc(lead)),
    `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`,
    p(esc(law)),
    p(esc(offer)),
    p(esc(close)),
    p(
      sig
        .map(esc)
        .join("<br>")
        .replace("getconsentinel.com", `<a href="${SITE}">getconsentinel.com</a>`),
    ),
    `<p style="color:#888;font-size:12px">${esc(optOut)}${postalAddress.trim() ? `<br>${esc(postalAddress.trim())}` : ""}</p>`,
  ].join("\n");

  return { subject: `Privacy issues on ${domain}`, text, html };
}
