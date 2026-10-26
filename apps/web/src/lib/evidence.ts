import type { Finding, ScanResult } from "@consentinel/shared";

/** One plain line of proof per finding: the request or cookie a lawyer can point at. */
export function proofLine(f: Finding): string {
  const e = f.evidence;
  switch (e.kind) {
    case "request":
      return `${e.method} ${e.url}`;
    case "cookie":
      return `Cookie "${e.name}" on ${e.domain.replace(/^\./, "")} (${e.firstParty ? "first" : "third"} party)`;
    case "script":
      return `Script ${e.src}`;
    case "credential":
      return `Credential exposed in ${e.location}`;
    case "cmp":
      return `${e.platform}: ${e.detail}`;
  }
}

const STATE: Record<Finding["observedUnder"], string> = {
  rejected: "After reject clicked",
  gpc: "Global Privacy Control on",
  default: "No choice made",
  granted: "After accept",
};

export function observedLabel(f: Finding): string {
  return STATE[f.observedUnder];
}

/** What the scan did to the consent banner, in words. */
export function consentTested(result: ScanResult): string[] {
  const out: string[] = [];
  const a = result.consentAttempt;
  if (a?.performed) out.push("Rejected all non-essential cookies in the consent banner");
  else if (a?.noRejectOffered)
    out.push("Banner shown with no reject option; page tested as loaded");
  else if (a?.bannerPresent === false)
    out.push("No consent banner appeared; page tested as loaded");
  else out.push("No reject control could be operated; page tested as loaded");
  out.push("Accepted all cookies, in a separate clean browser");
  if (result.gpcCheck?.mode === "separate-pass")
    out.push("Sent Global Privacy Control with no banner interaction, in a separate clean browser");
  else if (result.gpcCheck?.mode === "denied-pass")
    out.push(
      a?.performed
        ? "Sent Global Privacy Control alongside the reject click"
        : "Sent Global Privacy Control with no banner interaction",
    );
  return out;
}

const fmt = (tz: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });

export function whenBoth(d: Date): { et: string; utc: string } {
  return { et: fmt("America/New_York").format(d), utc: d.toISOString() };
}
