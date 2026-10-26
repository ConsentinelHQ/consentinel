/**
 * What changed between two versions of a policy, by paragraph. Order-aware
 * enough to read: added paragraphs in the new version's order, removed ones in
 * the old version's. Whitespace inside a paragraph is ignored, so a reflow
 * isn't a change.
 */

export interface PolicyDiff {
  added: string[];
  removed: string[];
}

const paragraphs = (text: string): string[] =>
  text
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

export function diffPolicy(before: string, after: string): PolicyDiff {
  const a = paragraphs(before);
  const b = paragraphs(after);
  const inA = new Set(a);
  const inB = new Set(b);
  return {
    added: [...new Set(b.filter((p) => !inA.has(p)))],
    removed: [...new Set(a.filter((p) => !inB.has(p)))],
  };
}

/**
 * A change worth telling someone about: some added or removed paragraph says
 * something. A bumped "Last updated" date or a reordered list is not.
 */
export function isMeaningfulChange(d: PolicyDiff): boolean {
  const DATE_ONLY =
    /^(last (updated|modified|revised)|effective( date)?|updated)\b[^a-z]*[\w ,.]{0,30}$/i;
  return [...d.added, ...d.removed].some((p) => p.length >= 40 && !DATE_ONLY.test(p));
}
