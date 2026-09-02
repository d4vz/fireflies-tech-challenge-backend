import assert from "node:assert/strict";
import { test } from "node:test";
import { askFredSystemPrompt, parseAskFredOrigin } from "./prompt.ts";

test("askFredSystemPrompt names the given UTC instant and today's exclusive range", () => {
  const prompt = askFredSystemPrompt(new Date("2026-09-01T17:17:00.000Z"), "http://localhost:8080");
  assert.match(prompt, /2026-09-01T17:17:00.000Z/);
  assert.match(prompt, /from=2026-09-01T00:00:00.000Z/);
  assert.match(prompt, /to=2026-09-02T00:00:00.000Z/);
});

test("askFredSystemPrompt tells Fred to link meetings with the app origin", () => {
  const prompt = askFredSystemPrompt(new Date("2026-09-01T17:17:00.000Z"), "http://localhost:8080");
  assert.match(prompt, /http:\/\/localhost:8080/);
  assert.match(prompt, /\[sourceId\]\(http:\/\/localhost:8080\/meetings\/\{id\}\)/);
  assert.match(prompt, /short date/);
  assert.match(prompt, /your_workspace_url/);
  assert.match(prompt, /https:\/\/meetings\//);
  assert.match(prompt, /Skip filler/);
  assert.doesNotMatch(prompt, /You are Fred, an assistant/);
});

test("parseAskFredOrigin keeps a bare origin and drops paths", () => {
  assert.equal(parseAskFredOrigin("http://localhost:8080"), "http://localhost:8080");
  assert.equal(parseAskFredOrigin("http://localhost:8080/"), "http://localhost:8080");
  assert.equal(parseAskFredOrigin("http://localhost:8080/meetings/1"), undefined);
  assert.equal(parseAskFredOrigin("https://meetings/abc"), undefined);
  assert.equal(parseAskFredOrigin(undefined), undefined);
});
