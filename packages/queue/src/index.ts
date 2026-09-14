/**
 * Queue and enqueue-time safety, with no browser dependency.
 *
 * This package exists so the web app can start a scan without pulling Playwright
 * and Chromium into a serverless bundle. The web app enqueues; only the worker
 * container ever touches a browser.
 */
export * from "./queue.js";
export * from "./safety.js";
export * from "./enqueue.js";
