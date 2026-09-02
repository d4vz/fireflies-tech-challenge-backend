import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, turnsFromTranscript } from "./process-meeting.ts";

test("turnsFromTranscript stores one row per speaker turn", () => {
  const turns = turnsFromTranscript({
    text: "A: hello\nB: world",
    segments: [
      { speaker: "A", start: 0, end: 1.2, text: "hello" },
      { speaker: "B", start: 1.3, end: 2.8, text: "world" },
    ],
  });
  assert.deepEqual(turns, [
    { index: 0, speaker: "A", start: 0, end: 1.2, text: "hello" },
    { index: 1, speaker: "B", start: 1.3, end: 2.8, text: "world" },
  ]);
});

test("turnsFromTranscript does not split a long speaker turn", () => {
  const turns = turnsFromTranscript({
    text: "A: abcdefghij",
    segments: [{ speaker: "A", start: 0, end: 9, text: "abcdefghij" }],
  });
  assert.deepEqual(turns, [{ index: 0, speaker: "A", start: 0, end: 9, text: "abcdefghij" }]);
});

test("turnsFromTranscript keeps an empty segment", () => {
  assert.deepEqual(turnsFromTranscript({ text: "", segments: [] }), []);
  assert.deepEqual(
    turnsFromTranscript({ text: "", segments: [{ speaker: "A", start: 0, end: 1, text: "" }] }),
    [{ index: 0, speaker: "A", start: 0, end: 1, text: "" }],
  );
});

test("chunkText slices by characters when there is no whitespace", () => {
  assert.deepEqual(chunkText("abcdefghij", 5), ["abcde", "fghij"]);
  assert.deepEqual(chunkText("", 5), []);
});
