import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranscribe } from "./create-transcribe.ts";

test("assemblyai transcribe keeps the whole file", () => {
  const transcribe = createTranscribe("assemblyai", { ASSEMBLYAI_API_KEY: "key" });
  assert.equal("windowSeconds" in transcribe, false);
});

test("openai diarize keeps the whole file", () => {
  process.env.OPENAI_API_KEY = "sk-test";
  const transcribe = createTranscribe("gpt-4o-transcribe-diarize", { OPENAI_API_KEY: "sk-test" });
  assert.equal("windowSeconds" in transcribe, false);
});

test("assemblyai requires ASSEMBLYAI_API_KEY", () => {
  assert.throws(() => createTranscribe("assemblyai", {}), /ASSEMBLYAI_API_KEY is missing/);
});
