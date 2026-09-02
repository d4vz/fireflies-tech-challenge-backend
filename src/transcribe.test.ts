import assert from "node:assert/strict";
import { test } from "node:test";
import type { PutBlob } from "../lib/blob/index.ts";
import { createApp } from "./create-app.ts";

test("POST /transcribe stores the meeting video and transcript, then returns their keys", async () => {
  const uploaded = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
  const stored = new Map<string, PutBlob>();
  let convertedName: string | undefined;
  let transcribedName: string | undefined;

  const app = createApp({
    hello: { greet: async () => "" },
    audio: {
      extract: async (file) => {
        convertedName = file.name;
        return new File(["audio-bytes"], "clip.mp3", { type: "audio/mpeg" });
      },
      ping: async () => {},
    },
    blob: {
      put: async (input) => {
        stored.set(input.key, input);
        return input.key;
      },
      ping: async () => {},
    },
    transcribe: {
      run: async (file) => {
        transcribedName = file.name;
        return { text: "hello from the recording" };
      },
      ping: async () => {},
    },
  });

  const form = new FormData();
  form.set("file", uploaded);

  const res = await app.request("/transcribe", {
    method: "POST",
    body: form,
  });

  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(convertedName, "clip.mp4");
  assert.equal(transcribedName, "clip.mp3");
  assert.equal(body.text, "hello from the recording");
  const videoKeyMatch = /^meetings\/([^/]+)\/video$/.exec(body.videoKey);
  assert.ok(videoKeyMatch);
  const meetingId = videoKeyMatch[1];
  assert.ok(meetingId);
  assert.equal(body.meetingId, meetingId);
  assert.equal(body.transcriptKey, `meetings/${meetingId}/transcript.json`);
  assert.equal(stored.get(body.videoKey)?.contentType, "video/mp4");
  assert.deepEqual(
    stored.get(body.videoKey)?.body,
    new Uint8Array([118, 105, 100, 101, 111, 45, 98, 121, 116, 101, 115]),
  );
  assert.equal(stored.get(body.transcriptKey)?.contentType, "application/json");
});

test("POST /transcribe returns 400 when file is missing", async () => {
  const app = createApp({
    hello: { greet: async () => "" },
    audio: { extract: async (file) => file, ping: async () => {} },
    blob: { put: async (input) => input.key, ping: async () => {} },
    transcribe: { run: async () => ({ text: "" }), ping: async () => {} },
  });

  const res = await app.request("/transcribe", {
    method: "POST",
    body: new FormData(),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "file is required" });
});
