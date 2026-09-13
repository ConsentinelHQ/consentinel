import type { Page } from "playwright";
import { CMPS } from "./registry";

export type ConsentAction = "accept" | "reject";

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

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) === 0) continue;
      await loc.click({ timeout: 2000 });
      return { ok: true, action, cmp: cmp.name, selector: sel };
    } catch {
      // try the next candidate selector
    }
  }
  return {
    ok: false,
    reason: `no clickable ${action} control found for ${cmp.name}`,
    tried: selectors,
  };
}

export const acceptConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "accept");
export const rejectConsent = (page: Page, cmpId: string): Promise<OperateResult> =>
  operate(page, cmpId, "reject");
