import type { Page } from "playwright";
import { CMPS } from "./registry.js";

export type ConsentAction = "accept" | "reject";

/** How long to keep looking for a consent control before calling it absent. */
const WAIT_FOR_CONTROL_MS = 8000;
const POLL_MS = 250;

export type OperateResult =
  | { ok: true; action: ConsentAction; cmp: string; selector: string }
  | {
      ok: false;
      reason: string;
      bannerPresent?: boolean;
      /** Banner shown, but it had no decline control at all. Their choice, not our miss. */
      noRejectOffered?: boolean;
      tried?: string[];
    };

export async function operate(
  page: Page,
  cmpId: string,
  action: ConsentAction,
): Promise<OperateResult> {
  const cmp = CMPS.find((c) => c.id === cmpId);
  if (!cmp) return { ok: false, reason: `unknown CMP "${cmpId}"` };

  const selectors = action === "accept" ? cmp.accept : cmp.reject;
  if (selectors.length === 0)
    return { ok: false, reason: `no ${action} selector known for ${cmp.name}` };

  /**
   * CMP banners are injected asynchronously and often animate in. count() only
   * asks whether the node is in the DOM, so a banner that exists but is still
   * hidden passed that check and then failed the click - silently, on a timer.
   *
   * That made scans non-reproducible: the same site returned "rejected" on one
   * run and "default" on the next, which silently downgrades evidence strength
   * and would make scan-to-scan diffing report noise as regressions.
   *
   * Wait for the control to actually be actionable before deciding it is absent.
   */
  const deadline = Date.now() + WAIT_FOR_CONTROL_MS;
  const attempted: string[] = [];
  /**
   * Tracked separately from `attempted`: a control we saw and failed to click is
   * our bug, a control that was never on the page is their configuration. Relying
   * on `attempted` being empty would couple that distinction to whether
   * isVisible() happens to throw.
   */
  let sawControl = false;

  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (!(await loc.isVisible())) continue;
        sawControl = true;
        await loc.scrollIntoViewIfNeeded({ timeout: 1000 });
        await loc.click({ timeout: 3000 });
        if (!attempted.includes(sel)) attempted.push(sel);
        return { ok: true, action, cmp: cmp.name, selector: sel };
      } catch {
        if (!attempted.includes(sel)) attempted.push(sel);
      }
    }
    await page.waitForTimeout(POLL_MS);
  }
  /**
   * Distinguish "the banner never appeared" from "the banner appeared but we
   * could not click it". A CMP that loads its SDK and shows no banner is a real
   * finding - often geo-targeting that exempts US visitors - and it is a
   * materially different claim from a tooling failure on our side.
   */
  let bannerPresent = false;
  for (const sel of cmp.selectors) {
    try {
      if (await page.locator(sel).first().isVisible()) {
        bannerPresent = true;
        break;
      }
    } catch {
      // Selector invalid for this page; keep checking the rest.
    }
  }

  /**
   * Three outcomes, and only one is our problem.
   *
   * No banner: the CMP loaded and showed nothing, usually geo-targeting. Theirs.
   * Banner with no reject control: notice-only, the visitor cannot decline. Theirs,
   * and a stronger finding than a leaky tag because it is deliberate.
   * Banner with a control we could not click: ours, and a bug to fix.
   */
  const noRejectOffered = bannerPresent && action === "reject" && !sawControl;

  return {
    ok: false,
    bannerPresent,
    noRejectOffered,
    reason: !bannerPresent
      ? `${cmp.name} is installed but showed no consent banner`
      : noRejectOffered
        ? `${cmp.name} banner offers no way to decline`
        : `${cmp.name} banner is present but no ${action} control could be clicked`,
    tried: attempted.length > 0 ? attempted : selectors,
  };
}

export const acceptConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "accept");
export const rejectConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "reject");
