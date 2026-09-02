import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText, rowsFromTranscript } from "./process-meeting.ts";

test("rowsFromTranscript stores one row per short speaker turn", () => {
  const rows = rowsFromTranscript(
    {
      text: "A: hello\nB: world",
      segments: [
        { speaker: "A", start: 0, end: 1.2, text: "hello" },
        { speaker: "B", start: 1.3, end: 2.8, text: "world" },
      ],
    },
    500,
  );
  assert.deepEqual(rows, [
    { index: 0, speaker: "A", start: 0, end: 1.2, text: "hello" },
    { index: 1, speaker: "B", start: 1.3, end: 2.8, text: "world" },
  ]);
});

test("rowsFromTranscript splits only the long turn and keeps its speaker times", () => {
  const rows = rowsFromTranscript(
    {
      text: "A: abcdefghij",
      segments: [{ speaker: "A", start: 0, end: 9, text: "abcdefghij" }],
    },
    5,
  );
  assert.deepEqual(rows, [
    { index: 0, speaker: "A", start: 0, end: 9, text: "abcde" },
    { index: 1, speaker: "A", start: 0, end: 9, text: "fghij" },
  ]);
});

test("rowsFromTranscript prefers a later whitespace split inside a long turn", () => {
  const rows = rowsFromTranscript(
    {
      text: "A: hello world",
      segments: [{ speaker: "A", start: 0, end: 4, text: "hello world" }],
    },
    8,
  );
  assert.deepEqual(
    rows.map((row) => row.text),
    ["hello", "world"],
  );
  assert.equal(rows[0]?.speaker, "A");
  assert.equal(rows[1]?.speaker, "A");
});

test("rowsFromTranscript skips empty segments", () => {
  assert.deepEqual(rowsFromTranscript({ text: "", segments: [] }, 5), []);
  assert.deepEqual(
    rowsFromTranscript({ text: "", segments: [{ speaker: "A", start: 0, end: 1, text: "" }] }, 5),
    [],
  );
});

test("chunkText slices by characters when there is no whitespace", () => {
  assert.deepEqual(chunkText("abcdefghij", 5), ["abcde", "fghij"]);
  assert.deepEqual(chunkText("", 5), []);
});
