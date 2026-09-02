import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSCRIBE_TIMEOUT_MS } from "./openai-transcribe.ts";

test("diarize waits 1 hour so a long file can finish", () => {
  assert.equal(TRANSCRIBE_TIMEOUT_MS, 60 * 60 * 1_000);
});
