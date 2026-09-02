import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranscribe } from "./create-transcribe.ts";
import { OPENAI_TRANSCRIBE_WINDOW_SECONDS } from "./openai/openai-transcribe.ts";

test("assemblyai transcribe keeps the whole file", () => {
  const transcribe = createTranscribe("assemblyai", { ASSEMBLYAI_API_KEY: "key" });
  assert.equal(transcribe.windowSeconds, undefined);
});

test("openai diarize splits into 2-minute windows", () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const transcribe = createTranscribe("gpt-4o-transcribe-diarize", { OPENAI_API_KEY: "sk-test" });
  assert.equal(transcribe.windowSeconds, OPENAI_TRANSCRIBE_WINDOW_SECONDS);
});

test("assemblyai requires ASSEMBLYAI_API_KEY", () => {
  assert.throws(() => createTranscribe("assemblyai", {}), /ASSEMBLYAI_API_KEY is missing/);
});
