import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createAssemblyaiTranscribe } from "./assemblyai-transcribe.ts";

function jsonResponse(json: string, status = 200) {
  return new Response(json, {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("run uploads audio, polls, and maps speaker utterances", async () => {
  const calls: string[] = [];
  const transcribe = createAssemblyaiTranscribe("key", {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/v2/upload")) {
        return jsonResponse(JSON.stringify({ upload_url: "https://cdn.assemblyai.com/upload/x" }));
      }
      if (url.endsWith("/v2/transcript") && init?.method === "POST") {
        return jsonResponse(JSON.stringify({ id: "t1", status: "queued" }));
      }
      if (url.endsWith("/v2/transcript/t1")) {
        return jsonResponse(
          JSON.stringify({
            status: "completed",
            utterances: [{ speaker: "A", start: 0, end: 2000, text: "hello" }],
          }),
        );
      }
      throw new Error(url);
    },
    sleep: async () => undefined,
    now: () => 0,
  });
  const dir = await mkdtemp(path.join(tmpdir(), "aai-"));
  const audioPath = path.join(dir, "audio.mp3");
  await writeFile(audioPath, "x");
  const result = await transcribe.run(audioPath);
  assert.deepEqual(result.segments, [{ speaker: "A", start: 0, end: 2, text: "hello" }]);
  assert.deepEqual(calls, [
    "POST https://api.assemblyai.com/v2/upload",
    "POST https://api.assemblyai.com/v2/transcript",
    "GET https://api.assemblyai.com/v2/transcript/t1",
  ]);
});

test("run waits through queued then completed", async () => {
  let polls = 0;
  const transcribe = createAssemblyaiTranscribe("key", {
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v2/upload")) {
        return jsonResponse(JSON.stringify({ upload_url: "https://cdn.assemblyai.com/upload/x" }));
      }
      if (url.endsWith("/v2/transcript") && init?.method === "POST") {
        return jsonResponse(JSON.stringify({ id: "t1" }));
      }
      polls += 1;
      if (polls === 1) {
        return jsonResponse(JSON.stringify({ status: "queued" }));
      }
      return jsonResponse(
        JSON.stringify({
          status: "completed",
          utterances: [{ speaker: "B", start: 1000, end: 2500, text: "later" }],
        }),
      );
    },
    sleep: async () => undefined,
    now: () => 0,
  });
  const dir = await mkdtemp(path.join(tmpdir(), "aai-"));
  const audioPath = path.join(dir, "audio.mp3");
  await writeFile(audioPath, "x");
  const result = await transcribe.run(audioPath);
  assert.equal(polls, 2);
  assert.deepEqual(result.segments, [{ speaker: "B", start: 1, end: 2.5, text: "later" }]);
});

test("run throws the AssemblyAI error status", async () => {
  const transcribe = createAssemblyaiTranscribe("key", {
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v2/upload")) {
        return jsonResponse(JSON.stringify({ upload_url: "https://cdn.assemblyai.com/upload/x" }));
      }
      if (url.endsWith("/v2/transcript") && init?.method === "POST") {
        return jsonResponse(JSON.stringify({ id: "t1" }));
      }
      return jsonResponse(JSON.stringify({ status: "error", error: "file was silent" }));
    },
    sleep: async () => undefined,
    now: () => 0,
  });
  const dir = await mkdtemp(path.join(tmpdir(), "aai-"));
  const audioPath = path.join(dir, "audio.mp3");
  await writeFile(audioPath, "x");
  await assert.rejects(() => transcribe.run(audioPath), /file was silent/);
});
