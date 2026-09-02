import assert from "node:assert/strict";
import { test } from "node:test";
import type { PutBlob } from "./lib/blob/index.ts";
import type { Meeting } from "./features/meetings/meeting.ts";
import { createApp } from "./create-app.ts";

const meetingId = "67a1b2c3d4e5f678901234ab";

test("POST /meetings/upload stores the video and thumbnail, then inserts a meeting document", async () => {
  const uploaded = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
  const stored = new Map<string, PutBlob>();
  let inserted: Meeting | undefined;

  const app = createApp({
    video: {
      extract: async () => new File(["audio-bytes"], "clip.mp3", { type: "audio/mpeg" }),
      durationInSeconds: async () => 12,
      thumbnail: async () => new File(["thumb-bytes"], "thumb.jpg", { type: "image/jpeg" }),
      ping: async () => {},
    },
    blob: {
      put: async (input) => {
        stored.set(input.key, input);
        return `https://blob.test/${input.key}`;
      },
      ping: async () => {},
    },
    transcribe: {
      run: async () => ({ text: "hello from the recording" }),
      ping: async () => {},
    },
    meetings: {
      createId: () => meetingId,
      insert: async (meeting) => {
        inserted = meeting;
      },
    },
  });

  const form = new FormData();
  form.set("file", uploaded);

  const res = await app.request("/meetings/upload", {
    method: "POST",
    body: form,
  });

  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body._id, meetingId);
  assert.equal(body.sourceType, "upload");
  assert.equal(body.sourceId, "clip.mp4");
  assert.ok(Date.parse(body.createdAt) > 0);
  assert.deepEqual(body.transcript, {
    text: "hello from the recording",
    chunkSize: 500,
    chunkCount: 1,
    charLength: 24,
  });
  assert.deepEqual(body.blob, {
    url: `https://blob.test/meetings/${meetingId}/video`,
    durationInSeconds: 12,
    sizeInBytes: 11,
    thumbnailUrl: `https://blob.test/meetings/${meetingId}/thumbnail.jpg`,
  });
  assert.equal(stored.get(`meetings/${meetingId}/video`)?.contentType, "video/mp4");
  assert.equal(stored.get(`meetings/${meetingId}/thumbnail.jpg`)?.contentType, "image/jpeg");
  assert.equal(inserted?._id, meetingId);
  assert.equal(inserted?.sourceType, "upload");
  assert.equal(inserted?.sourceId, "clip.mp4");
});

test("POST /meetings/upload records two chunks when the transcript is longer than chunkSize", async () => {
  const uploaded = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
  const text = "a".repeat(501);

  const app = createApp({
    video: {
      extract: async () => new File(["audio-bytes"], "clip.mp3", { type: "audio/mpeg" }),
      durationInSeconds: async () => 1,
      thumbnail: async () => new File(["thumb-bytes"], "thumb.jpg", { type: "image/jpeg" }),
      ping: async () => {},
    },
    blob: { put: async (input) => `https://blob.test/${input.key}`, ping: async () => {} },
    transcribe: { run: async () => ({ text }), ping: async () => {} },
    meetings: { createId: () => meetingId, insert: async () => {} },
  });

  const form = new FormData();
  form.set("file", uploaded);
  const res = await app.request("/meetings/upload", { method: "POST", body: form });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.transcript.chunkSize, 500);
  assert.equal(body.transcript.chunkCount, 2);
  assert.equal(body.transcript.charLength, 501);
});

test("POST /meetings/upload returns 400 when file is missing", async () => {
  const app = createApp({
    video: {
      extract: async (file) => file,
      durationInSeconds: async () => 0,
      thumbnail: async (file) => file,
      ping: async () => {},
    },
    blob: { put: async (input) => `https://blob.test/${input.key}`, ping: async () => {} },
    transcribe: { run: async () => ({ text: "" }), ping: async () => {} },
    meetings: { createId: () => meetingId, insert: async () => {} },
  });

  const res = await app.request("/meetings/upload", {
    method: "POST",
    body: new FormData(),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "file is required" });
});
