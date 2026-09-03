import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("summarize prompt does not ask the model to prefix action items with speaker ids", async () => {
  const source = await readFile(new URL("./openai-summarize.ts", import.meta.url), "utf8");
  assert.match(source, /Summarize the meeting/);
  assert.doesNotMatch(source, /name that speaker in action items/);
  assert.doesNotMatch(source, /A:, B:/);
});
