import type { Page } from "playwright";

/**
 * Live scan view. The scanner reports what it's doing as it goes: phases,
 * vendors seen, accessibility issues, and screenshots of the page. Sinks decide
 * whether anyone is watching; the scanner never waits on them.
 */
export interface LiveSink {
  phase(label: string): void;
  event(kind: LiveEventKind, label: string, detail?: string): void;
  /** Screenshot the page if someone is watching. Throttled by the sink; never throws. */
  frame(page: Page, force?: boolean): Promise<void>;
}

export type LiveEventKind = "vendor" | "a11y" | "info";

export const NO_LIVE: LiveSink = {
  phase: () => undefined,
  event: () => undefined,
  frame: () => Promise.resolve(),
};

/** Frames every couple of seconds while a pass runs. Returns the stop function. */
export function streamFrames(live: LiveSink, page: Page, everyMs = 2_000): () => void {
  if (live === NO_LIVE) return () => undefined;
  const t = setInterval(() => void live.frame(page), everyMs);
  return () => clearInterval(t);
}

/** JPEG of the viewport, small enough to poll. Null if the page is gone. */
export async function frameOf(page: Page): Promise<Buffer | null> {
  try {
    return await page.screenshot({ type: "jpeg", quality: 45, timeout: 3_000, scale: "css" });
  } catch {
    return null;
  }
}
