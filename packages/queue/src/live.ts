import type { Redis } from "ioredis";

/**
 * Live scan view, shared by the worker (writes) and the web app (reads).
 * Lives in Redis only, for a few minutes: nothing here is a record of the scan.
 *
 * The worker only does the work (screenshots) while someone is watching: each
 * poll from the scan page refreshes the watch key.
 */
export interface LiveEvent {
  /** Milliseconds since the scan started. */
  t: number;
  kind: "phase" | "vendor" | "a11y" | "info";
  label: string;
  detail?: string;
}

export interface LiveState {
  startedAt: number;
  phase: string;
  events: LiveEvent[];
  /** JPEG data URL of the latest frame. */
  frame?: string;
  frameAt?: number;
  updatedAt: number;
}

const STATE_TTL_S = 15 * 60;
const WATCH_TTL_S = 20;
const MAX_EVENTS = 60;

const stateKey = (scanId: string): string => `live:${scanId}`;
const watchKey = (scanId: string): string => `live:watch:${scanId}`;

/** Called by the scan page on every poll. */
export async function markWatched(redis: Redis, scanId: string): Promise<void> {
  await redis.set(watchKey(scanId), "1", "EX", WATCH_TTL_S);
}

export async function isWatched(redis: Redis, scanId: string): Promise<boolean> {
  return (await redis.exists(watchKey(scanId))) === 1;
}

export async function readLive(redis: Redis, scanId: string): Promise<LiveState | null> {
  const raw = await redis.get(stateKey(scanId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LiveState;
  } catch {
    return null;
  }
}

export async function writeLive(redis: Redis, scanId: string, state: LiveState): Promise<void> {
  const trimmed = { ...state, events: state.events.slice(-MAX_EVENTS) };
  await redis.set(stateKey(scanId), JSON.stringify(trimmed), "EX", STATE_TTL_S);
}
