import assert from "node:assert/strict";
import { test } from "node:test";
import { toTranscript } from "./to-transcript.ts";

test("toTranscript labels two segments and keeps speaker bounds", () => {
  const result = toTranscript({
    segments: [
      { speaker: "A", start: 0, end: 1.5, text: "hello" },
      { speaker: "B", start: 1.5, end: 3, text: "world" },
    ],
  });
  assert.deepEqual(result, {
    text: "A: hello\nB: world",
    segments: [
      { speaker: "A", start: 0, end: 1.5, text: "hello" },
      { speaker: "B", start: 1.5, end: 3, text: "world" },
    ],
  });
});

test("toTranscript drops empty-text segments", () => {
  const result = toTranscript({
    segments: [
      { speaker: "A", start: 0, end: 1, text: "hello" },
      { speaker: "B", start: 1, end: 2, text: "" },
    ],
  });
  assert.deepEqual(result, {
    text: "A: hello",
    segments: [{ speaker: "A", start: 0, end: 1, text: "hello" }],
  });
});

test("toTranscript returns empty transcript when every segment is empty", () => {
  const result = toTranscript({
    segments: [
      { speaker: "A", start: 0, end: 1, text: "" },
      { speaker: "B", start: 1, end: 2, text: "   " },
    ],
  });
  assert.deepEqual(result, { text: "", segments: [] });
});

test("toTranscript returns empty when segments are missing", () => {
  assert.deepEqual(toTranscript({}), { text: "", segments: [] });
});
