import assert from "node:assert/strict";
import { test } from "node:test";
import { utterancesToTranscript } from "./to-transcript.ts";

test("utterancesToTranscript converts millisecond bounds to seconds", () => {
  const result = utterancesToTranscript({
    utterances: [
      { speaker: "A", start: 0, end: 1500, text: "hello" },
      { speaker: "B", start: 1600, end: 3200, text: "world" },
    ],
  });
  assert.deepEqual(result, {
    text: "A: hello\nB: world",
    segments: [
      { speaker: "A", start: 0, end: 1.5, text: "hello" },
      { speaker: "B", start: 1.6, end: 3.2, text: "world" },
    ],
  });
});

test("utterancesToTranscript drops empty utterances", () => {
  const result = utterancesToTranscript({
    utterances: [
      { speaker: "A", start: 0, end: 1000, text: "hello" },
      { speaker: "B", start: 1000, end: 2000, text: "  " },
    ],
  });
  assert.deepEqual(result.segments, [{ speaker: "A", start: 0, end: 1, text: "hello" }]);
});

test("utterancesToTranscript is empty when utterances are missing", () => {
  assert.deepEqual(utterancesToTranscript({}), { text: "", segments: [] });
});
