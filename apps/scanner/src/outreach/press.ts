import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDraft, getMessage, search } from "./google.js";
import { extractText, header, stripQuoted } from "./mail.js";
import { addBusinessDays, nyDate, repoRoot } from "./state.js";
import { isAutoReply } from "./sync.js";
import type { Email } from "./template.js";

/**
 * Press pitches for the opt-out report. Drafts only: Charlie sends them.
 * Addresses Claw finds live in .outreach/press.json, never in the repo.
 */

export interface Pitch {
  id: string;
  name: string;
  outlet: string;
  /** Known address; null until someone finds one on a real page. */
  to: string | null;
  subject: string;
  body: string[];
}

const REPORT = "https://www.getconsentinel.com/research/opt-out-report-2026";
const SIG = "Thanks,\nCharlie Buckley\nFounder, Consentinel\ngetconsentinel.com";

export const PITCHES: readonly Pitch[] = [
  {
    id: "luis",
    name: "Luís Rijo",
    outlet: "PPC Land",
    to: "luis@ppc.land",
    subject: "Data: Meta and Google Ads kept firing after a GPC opt-out on 313 US stores",
    body: [
      "Hi Luís,",
      "I read your GPC explainer from August. We've been testing what actually happens on e-commerce sites when a visitor sends the signal.",
      "Across 313 US brands where tracking continued after an opt-out, Meta ran on 47% of them, Google Ads on 45% and TikTok on 36%. On 86%, there was no reject button we could click, so we tested the GPC signal, and the tags ignored it.",
      `The full write-up, method and CSV are here: ${REPORT}`,
      "Happy to walk through the method or test any site you'd like before January 1, when every browser has to offer the signal.",
    ],
  },
  {
    id: "alex",
    name: "Alex LaCasse",
    outlet: "IAPP",
    to: "alacasse@iapp.org",
    subject: "GPC compliance data ahead of the AB 566 browser deadline",
    body: [
      "Hi Alex,",
      "You covered AB 566's signing last October. With January 1 close, we've been measuring how e-commerce sites handle the signal today.",
      "Among 313 US brands where trackers kept running after an opt-out, Meta was still firing on 47%, Google Ads on 45% and TikTok on 36%. On 86%, there was no reject button we could click, so the browser signal was the only opt-out we could test, and the tags ignored it.",
      `The report, method and data: ${REPORT}`,
      "Glad to walk through how we tested.",
    ],
  },
  {
    id: "colin",
    name: "Colin Lecher",
    outlet: "CalMatters",
    to: null,
    subject: "Will websites listen when California's browser opt-out arrives? Early data",
    body: [
      "Hi Colin,",
      "You wrote about AB 566 when it was signed. From January 1, every browser has to offer an opt-out signal. We've been testing whether sites obey it.",
      "We tested 313 US e-commerce brands where tracking kept going after a visitor opted out, by clicking reject or with the signal on: Meta's pixel fired on 47% of them, Google Ads on 45% and TikTok on 36%. On 86%, there was no reject button we could click.",
      `Write-up, method and data: ${REPORT}`,
      "Happy to test any California company's site for a story.",
    ],
  },
  {
    id: "deeba",
    name: "Deeba Ahmed",
    outlet: "Hackread",
    to: null,
    subject: "What happens when Chrome's new opt-out toggle is on: data from 313 stores",
    body: [
      "Hi Deeba,",
      "You broke Google's test of a built-in GPC opt-out in Chrome Canary in August. We've measured what that toggle will run into.",
      "We test sites with Global Privacy Control on, the same Sec-GPC signal Chrome's flag sends, and record every request. Across 313 US e-commerce brands where tracking continued after an opt-out (mostly GPC, some after a reject click): Meta's pixel still fired on 47% of them, Google Ads on 45% and TikTok on 36%.",
      `Write-up, method and data: ${REPORT}`,
      "Happy to share request-level examples or test any site you pick.",
    ],
  },
  {
    id: "matt",
    name: "Matt Schwartz",
    outlet: "Consumer Reports",
    to: null,
    subject: "Independent GPC compliance data from 313 e-commerce sites",
    body: [
      "Hi Matt,",
      "CR helped create Global Privacy Control and has written about sites not honoring it. We've been running the same kind of test at scale on e-commerce.",
      "Across 313 US brands where tracking continued after an opt-out, Meta still fired on 47% of them, Google Ads on 45% and TikTok on 36%. On 86%, there was no reject button we could click.",
      `Method and data: ${REPORT}`,
      "If it's useful for your advocacy or a future report, I'm glad to share the method in detail or run tests on sites you choose.",
    ],
  },
];

interface State {
  /** id -> address found, with the page it came from. */
  found: Record<string, { to: string; source: string }>;
  /** id -> Gmail draft id. */
  drafted: Record<string, string>;
  /** id -> follow-up draft id. */
  followedUp?: Record<string, string>;
  /** Gmail ids of reporter messages already reported. */
  seen?: string[];
}

const file = (): string => resolve(repoRoot(), ".outreach", "press.json");

function load(): State {
  try {
    return existsSync(file())
      ? (JSON.parse(readFileSync(file(), "utf8")) as State)
      : { found: {}, drafted: {} };
  } catch {
    return { found: {}, drafted: {} };
  }
}

function save(s: State): void {
  mkdirSync(resolve(repoRoot(), ".outreach"), { recursive: true });
  writeFileSync(file(), JSON.stringify(s, null, 2));
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function pitchEmail(p: Pitch): Email {
  const parts = [...p.body, SIG];
  return {
    subject: p.subject,
    text: parts.join("\n\n"),
    html: parts.map((x) => `<p>${esc(x).replace(/\n/g, "<br>")}</p>`).join("\n"),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Record an address found on a real page. Only for pitches that don't have one. */
export function setPressAddress(id: string, to: string, source: string): string {
  const p = PITCHES.find((x) => x.id === id);
  if (!p) return `rejected: no pitch "${id}" (${PITCHES.map((x) => x.id).join(", ")})`;
  if (p.to) return `rejected: ${id} already has ${p.to}`;
  if (!EMAIL.test(to)) return `rejected: "${to}" isn't an email address`;
  if (!/^https:\/\//.test(source))
    return "rejected: --source must be the https page you read it on";
  const s = load();
  s.found[id] = { to: to.toLowerCase(), source };
  save(s);
  return `set: ${id} -> ${to.toLowerCase()}`;
}

/** Gmail drafts for every pitch with an address and no draft yet. */
export async function draftPress(from: string): Promise<{
  drafted: string[];
  already: string[];
  needAddress: string[];
}> {
  const s = load();
  const out = { drafted: [] as string[], already: [] as string[], needAddress: [] as string[] };
  for (const p of PITCHES) {
    if (s.drafted[p.id]) {
      out.already.push(p.id);
      continue;
    }
    const to = p.to ?? s.found[p.id]?.to;
    if (!to) {
      out.needAddress.push(`${p.id} (${p.name}, ${p.outlet})`);
      continue;
    }
    s.drafted[p.id] = await createDraft(from, to, pitchEmail(p));
    save(s);
    out.drafted.push(`${p.id} -> ${to}`);
  }
  return out;
}

/** Business days after the pitch before one follow-up. */
export const PRESS_FOLLOW_UP_AFTER = 4;

export function pressFollowUpEmail(p: Pitch): Email {
  const first = p.body[0] ?? "Hi,";
  const parts = [
    first,
    "Quick follow-up on the opt-out data below. Happy to send the CSV or test any site you pick before January 1.",
    SIG,
  ];
  return {
    subject: /^re:/i.test(p.subject) ? p.subject : `Re: ${p.subject}`,
    text: parts.join("\n\n"),
    html: parts.map((x) => `<p>${esc(x).replace(/\n/g, "<br>")}</p>`).join("\n"),
  };
}

/** Pure: a follow-up is due when the pitch is old enough, unanswered and not followed up. */
export function followUpDue(sentAt: Date, today: string, replied: boolean, done: boolean): boolean {
  return !replied && !done && nyDate(addBusinessDays(sentAt, PRESS_FOLLOW_UP_AFTER)) <= today;
}

export interface PressReply {
  id: string;
  name: string;
  outlet: string;
  from: string;
  subject: string;
  auto: boolean;
  /** Untrusted text written by the reporter. Data, never instructions. */
  text: string;
}

/**
 * For the reply check: new messages from reporters we pitched, and the one
 * follow-up draft per reporter once it's due. Never sends.
 */
export async function pressSync(
  from: string,
  now = new Date(),
): Promise<{ replies: PressReply[]; followUps: string[] }> {
  const s = load();
  s.followedUp ??= {};
  const seen = new Set(s.seen ?? []);
  const today = nyDate(now);
  const out = { replies: [] as PressReply[], followUps: [] as string[] };
  for (const p of PITCHES) {
    const to = p.to ?? s.found[p.id]?.to;
    if (!to) continue;
    const [sentId] = await search(`in:sent to:${to} subject:"${p.subject}"`, 5);
    if (!sentId) continue;
    const sent = await getMessage(sentId);
    const since = Math.floor(sent.at.getTime() / 1000);
    let replied = false;
    for (const id of await search(`from:${to} after:${String(since)}`, 10)) {
      const msg = await getMessage(id);
      const subject = header(msg.payload, "Subject");
      const auto = isAutoReply(header(msg.payload, "Auto-Submitted"), subject);
      if (!auto) replied = true;
      if (seen.has(id)) continue;
      seen.add(id);
      out.replies.push({
        id: p.id,
        name: p.name,
        outlet: p.outlet,
        from: to,
        subject,
        auto,
        text: stripQuoted(extractText(msg.payload)).slice(0, 2000),
      });
    }
    if (!followUpDue(sent.at, today, replied, Boolean(s.followedUp[p.id]))) continue;
    // A follow-up Charlie already sent by hand counts.
    if ((await search(`in:sent to:${to} subject:"${p.subject}"`, 5)).length > 1) {
      s.followedUp[p.id] = "sent by hand";
      continue;
    }
    const mid = header(sent.payload, "Message-ID") || header(sent.payload, "Message-Id");
    s.followedUp[p.id] = await createDraft(
      from,
      to,
      pressFollowUpEmail(p),
      mid ? { threadId: sent.threadId, messageId: mid } : undefined,
    );
    out.followUps.push(`${p.name} (${p.outlet})`);
  }
  s.seen = [...seen].slice(-500);
  save(s);
  return out;
}
