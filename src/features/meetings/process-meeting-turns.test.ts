import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunkText,
  joinTranscripts,
  rowsFromTranscript,
  shiftTranscript,
  transcribeWindows,
} from "./process-meeting.ts";

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

test("transcribeWindows keeps a short file as one window", () => {
  assert.deepEqual(transcribeWindows(90, 120), [{ start: 0, duration: 90 }]);
  assert.deepEqual(transcribeWindows(120, 120), [{ start: 0, duration: 120 }]);
  assert.deepEqual(transcribeWindows(240), [{ start: 0, duration: 240 }]);
});

test("transcribeWindows splits a long file into 2-minute windows", () => {
  assert.deepEqual(transcribeWindows(240, 120), [
    { start: 0, duration: 120 },
    { start: 120, duration: 120 },
  ]);
  assert.deepEqual(transcribeWindows(241, 120), [
    { start: 0, duration: 120 },
    { start: 120, duration: 120 },
    { start: 240, duration: 1 },
  ]);
});

test("shiftTranscript adds the window start to every turn", () => {
  const shifted = shiftTranscript(
    {
      text: "A: hi",
      segments: [{ speaker: "A", start: 1, end: 3, text: "hi" }],
    },
    120,
  );
  assert.deepEqual(shifted.segments, [{ speaker: "A", start: 121, end: 123, text: "hi" }]);
  assert.equal(shifted.text, "A: hi");
});

test("joinTranscripts concatenates turns in time order", () => {
  const joined = joinTranscripts([
    {
      text: "A: first",
      segments: [{ speaker: "A", start: 0, end: 2, text: "first" }],
    },
    {
      text: "B: second",
      segments: [{ speaker: "B", start: 120, end: 122, text: "second" }],
    },
  ]);
  assert.equal(joined.text, "A: first\nB: second");
  assert.deepEqual(joined.segments, [
    { speaker: "A", start: 0, end: 2, text: "first" },
    { speaker: "B", start: 120, end: 122, text: "second" },
  ]);
});
