import type { Page } from "playwright";
import { CMPS } from "./registry.js";

export type ConsentAction = "accept" | "reject";

/** How long to keep looking for a consent control before calling it absent. */
const WAIT_FOR_CONTROL_MS = 8000;
const POLL_MS = 250;

export type OperateResult =
  | { ok: true; action: ConsentAction; cmp: string; selector: string }
  | { ok: false; reason: string; tried?: string[] };

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

  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (!(await loc.isVisible())) continue;
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
  return {
    ok: false,
    reason: `no clickable ${action} control found for ${cmp.name}`,
    tried: attempted.length > 0 ? attempted : selectors,
  };
}

export const acceptConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "accept");
export const rejectConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "reject");
