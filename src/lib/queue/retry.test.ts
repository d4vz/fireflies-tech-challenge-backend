import assert from "node:assert/strict";
import { test } from "node:test";
import { isLastJobAttempt, isRetryableJobError } from "./retry.ts";

test("isRetryableJobError is true for OpenAI timeout names and messages", () => {
  const named = new Error("Request timed out.");
  named.name = "APIConnectionTimeoutError";
  assert.equal(isRetryableJobError(named), true);
  assert.equal(isRetryableJobError(new Error("Request timed out.")), true);
  assert.equal(isRetryableJobError(new Error("video is missing")), false);
});

test("isLastJobAttempt is true on the final try", () => {
  assert.equal(isLastJobAttempt(0, 3), false);
  assert.equal(isLastJobAttempt(1, 3), false);
  assert.equal(isLastJobAttempt(2, 3), true);
  assert.equal(isLastJobAttempt(0, 1), true);
});
