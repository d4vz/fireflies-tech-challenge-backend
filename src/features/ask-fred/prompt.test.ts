import assert from "node:assert/strict";
import { test } from "node:test";
import { askFredSystemPrompt } from "./prompt.ts";

test("askFredSystemPrompt names the given UTC instant and today's exclusive range", () => {
  const prompt = askFredSystemPrompt(new Date("2026-09-01T17:17:00.000Z"));
  assert.match(prompt, /2026-09-01T17:17:00.000Z/);
  assert.match(prompt, /from=2026-09-01T00:00:00.000Z/);
  assert.match(prompt, /to=2026-09-02T00:00:00.000Z/);
});

test("askFredSystemPrompt tells Fred to link meetings with the tool href", () => {
  const prompt = askFredSystemPrompt(new Date("2026-09-01T17:17:00.000Z"));
  assert.match(prompt, /href/);
  assert.match(prompt, /\/meetings\/\{id\}/);
  assert.match(prompt, /short date/);
  assert.match(prompt, /your_workspace_url/);
  assert.match(prompt, /https:\/\/meetings\//);
  assert.match(prompt, /Skip filler/);
  assert.doesNotMatch(prompt, /You are Fred, an assistant/);
});
