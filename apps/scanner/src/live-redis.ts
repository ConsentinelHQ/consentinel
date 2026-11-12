import { isWatched, writeLive, type LiveEvent, type LiveState } from "@consentinel/queue";
import type { Redis } from "ioredis";
import type { Page } from "playwright";
import { frameOf, type LiveSink } from "./live.js";

const FRAME_EVERY_MS = 1_800;
const FLUSH_EVERY_MS = 600;
const WATCH_CHECK_MS = 3_000;

/**
 * Writes the live view for one scan. Events are tiny and always written, so a
 * visitor who opens the page late still sees the story so far. Screenshots only
 * happen while someone is watching. Every Redis error is swallowed: the live
 * view must never fail a scan.
 */
export function redisLiveSink(redis: Redis, scanId: string): LiveSink & { close(): Promise<void> } {
  const startedAt = Date.now();
  const state: LiveState = { startedAt, phase: "Starting", events: [], updatedAt: startedAt };
  let watched = false;
  let watchCheckedAt = 0;
  let lastFrameAt = 0;
  let shooting = false;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  const refreshWatch = (): void => {
    if (Date.now() - watchCheckedAt < WATCH_CHECK_MS) return;
    watchCheckedAt = Date.now();
    isWatched(redis, scanId)
      .then((w) => {
        watched = w;
      })
      .catch(() => undefined);
  };

  const flush = async (): Promise<void> => {
    timer = null;
    state.updatedAt = Date.now();
    await writeLive(redis, scanId, state).catch(() => undefined);
  };
  const schedule = (): void => {
    if (closed || timer) return;
    timer = setTimeout(() => void flush(), FLUSH_EVERY_MS);
  };
  const push = (e: Omit<LiveEvent, "t">): void => {
    state.events.push({ t: Date.now() - startedAt, ...e });
    refreshWatch();
    schedule();
  };

  refreshWatch();
  return {
    phase(label) {
      state.phase = label;
      push({ kind: "phase", label });
    },
    event(kind, label, detail) {
      push({ kind, label, ...(detail ? { detail } : {}) });
    },
    async frame(page: Page, force = false) {
      refreshWatch();
      if (closed || !watched || shooting) return;
      if (!force && Date.now() - lastFrameAt < FRAME_EVERY_MS) return;
      shooting = true;
      try {
        const jpeg = await frameOf(page);
        if (jpeg) {
          lastFrameAt = Date.now();
          state.frame = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
          state.frameAt = lastFrameAt - startedAt;
          schedule();
        }
      } finally {
        shooting = false;
      }
    },
    async close() {
      if (timer) clearTimeout(timer);
      closed = true;
      await flush();
    },
  };
}
