import assert from "node:assert/strict";
import { test } from "node:test";
import { waitCopy } from "./queue-copy";

void test("shows place in line and minutes", () => {
  assert.equal(waitCopy(14, 360), "You're #14 in line, about 6 minutes.");
});

void test("first in line gets just the ETA", () => {
  assert.equal(waitCopy(1, 70), "Ready in about 1 minute.");
});

void test("nothing known says nothing", () => {
  assert.equal(waitCopy(undefined, undefined), "");
});
