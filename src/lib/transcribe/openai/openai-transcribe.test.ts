import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSCRIBE_TIMEOUT_MS } from "./openai-transcribe.ts";

test("diarize waits 30 minutes so a 15 minute file can finish", () => {
  assert.equal(TRANSCRIBE_TIMEOUT_MS, 30 * 60 * 1_000);
});
