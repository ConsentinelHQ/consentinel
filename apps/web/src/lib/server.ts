import "server-only";
import { createDb, type Database } from "@consentinel/db";
import { createScanQueue, redisConnection, type ScanQueue } from "@consentinel/queue";
import IORedis from "ioredis";

/**
 * Serverless functions are recycled constantly. Cache clients on globalThis so a
 * burst of requests does not open a connection per invocation and exhaust Postgres.
 */
const globals = globalThis as unknown as {
  __db?: Database;
  __queue?: ScanQueue;
  __redis?: IORedis;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function db(): Database {
  // Pooled connection: route handlers are short-lived and numerous.
  globals.__db ??= createDb(process.env["DATABASE_URL_POOLED"] ?? required("DATABASE_URL"));
  return globals.__db;
}

export function scanQueue(): ScanQueue {
  globals.__queue ??= createScanQueue(redisConnection(required("REDIS_URL")));
  return globals.__queue;
}

export function redis(): IORedis {
  globals.__redis ??= new IORedis(required("REDIS_URL"), { maxRetriesPerRequest: null });
  return globals.__redis;
}
