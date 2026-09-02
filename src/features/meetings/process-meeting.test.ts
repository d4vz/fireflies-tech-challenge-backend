import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { ownerId } from "../../lib/auth/index.ts";
import { parseSettings } from "../../lib/config/index.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import { createMemoryTranscripts } from "./memory-transcripts.ts";
import { processMeeting, processMeetingJob, type ProcessMeetingDeps } from "./process-meeting.ts";
import type { MeetingDraft, MeetingsStore } from "./store.ts";

const settings = parseSettings(`
chunkSize: 5
models:
  transcribe: gpt-4o-transcribe-diarize
  summary: gpt-4o-mini
  embed: text-embedding-3-small
  chat: gpt-4o-mini
upload:
  maxFileBytes: 100
  video:
    mimeTypes:
      - video/mp4
    extensions:
      - mp4
  audio:
    mimeTypes:
      - audio/mpeg
    extensions:
      - mp3
`);

const actor = { id: ownerId("user_a") };

function unused(): never {
  throw new Error("unused");
}

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function draft(): MeetingDraft {
  return {
    _id: new ObjectId(),
    sourceType: "upload",
    sourceId: "clip.mp4",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "queued",
    blob: {
      kind: "video",
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  };
}

async function queuedJob(blobGet: ProcessMeetingDeps["blob"]["get"]): Promise<{
  id: string;
  store: MeetingsStore;
  meetings: ReturnType<typeof createMemoryMeetings>["meetings"];
  transcripts: ReturnType<typeof createMemoryTranscripts>;
  deps: ProcessMeetingDeps;
}> {
  const { meetings, store } = createMemoryMeetings();
  const row = draft();
  await meetings.insert(actor, row);
  const transcripts = createMemoryTranscripts();
  const deps: ProcessMeetingDeps = {
    video: {
      extract: async (inputPath) => inputPath,
      durationInSeconds: async () => unused(),
      thumbnail: async () => unused(),
    },
    blob: {
      put: async () => unused(),
      get: blobGet,
      ping: async () => undefined,
    },
    transcribe: {
      run: async () => ({
        text: "A: abcdefghij",
        segments: [{ speaker: "A", start: 0, end: 2, text: "abcdefghij" }],
      }),
      ping: async () => undefined,
    },
    summarize: {
      run: async () => ({
        text: "summary",
        takeaways: ["one"],
        actionItems: ["review notes"],
      }),
    },
    embed: {
      model: "test-embed",
      run: async (texts) => texts.map((_, index) => [index, 1]),
    },
    meetings: store,
    transcripts,
    settings,
  };
  return { id: row._id.toHexString(), store, meetings, transcripts, deps };
}

test("processMeeting marks ready with chunks and tasks", async () => {
  const { id, meetings, transcripts, deps } = await queuedJob(async () => ({
    body: bytesStream(new Uint8Array([1, 2, 3])),
    contentType: "video/mp4",
  }));
  let summarized = "";
  deps.summarize = {
    run: async (transcript) => {
      summarized = transcript;
      return {
        text: "summary",
        takeaways: ["one"],
        actionItems: ["review notes"],
      };
    },
  };
  await processMeeting(deps, id);
  const ready = await meetings.get(actor, id);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.summary?.text, "summary");
  assert.equal(ready?.tasks?.length, 1);
  assert.equal(ready?.tasks?.[0]?.text, "review notes");
  assert.equal(summarized, "A: abcdefghij");
  const chunks = await transcripts.listByMeeting(id);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks, [
    { index: 0, speaker: "A", start: 0, end: 2, text: "abcde" },
    { index: 1, speaker: "A", start: 0, end: 2, text: "fghij" },
  ]);
});

test("processMeeting stays ready with no chunks when segments are empty", async () => {
  const { id, meetings, transcripts, deps } = await queuedJob(async () => ({
    body: bytesStream(new Uint8Array([1, 2, 3])),
    contentType: "video/mp4",
  }));
  deps.transcribe = {
    run: async () => ({ text: "", segments: [] }),
    ping: async () => undefined,
  };
  let summarized = "unset";
  deps.summarize = {
    run: async (transcript) => {
      summarized = transcript;
      return {
        text: "summary",
        takeaways: ["one"],
        actionItems: ["review notes"],
      };
    },
  };
  await processMeeting(deps, id);
  const ready = await meetings.get(actor, id);
  assert.equal(ready?.status, "ready");
  assert.equal(ready?.summary?.text, "summary");
  assert.deepEqual(await transcripts.listByMeeting(id), []);
  assert.equal(summarized, "");
});

test("processMeetingJob sets failed with the error message", async () => {
  const { id, meetings, deps } = await queuedJob(async () => ({
    body: bytesStream(new Uint8Array([1, 2, 3])),
    contentType: "video/mp4",
  }));
  deps.transcribe = {
    run: async () => {
      throw new Error("whisper down");
    },
    ping: async () => undefined,
  };
  await assert.rejects(() => processMeetingJob(deps, id), /whisper down/);
  const failed = await meetings.get(actor, id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "whisper down");
});

test("processMeetingJob does not fail a meeting on a timeout when retries remain", async () => {
  const { id, meetings, deps } = await queuedJob(async () => ({
    body: bytesStream(new Uint8Array([1, 2, 3])),
    contentType: "video/mp4",
  }));
  const timeout = new Error("Request timed out.");
  timeout.name = "APIConnectionTimeoutError";
  deps.transcribe = {
    run: async () => {
      throw timeout;
    },
    ping: async () => undefined,
  };
  await assert.rejects(() => processMeetingJob(deps, id, { lastAttempt: false }), /timed out/);
  const row = await meetings.get(actor, id);
  assert.equal(row?.status, "processing");
  assert.equal(row?.error, undefined);
});

test("processMeetingJob fails a meeting on the last timeout", async () => {
  const { id, meetings, deps } = await queuedJob(async () => ({
    body: bytesStream(new Uint8Array([1, 2, 3])),
    contentType: "video/mp4",
  }));
  const timeout = new Error("Request timed out.");
  timeout.name = "APIConnectionTimeoutError";
  deps.transcribe = {
    run: async () => {
      throw timeout;
    },
    ping: async () => undefined,
  };
  await assert.rejects(() => processMeetingJob(deps, id, { lastAttempt: true }), /timed out/);
  const failed = await meetings.get(actor, id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "Request timed out.");
});

test("processMeetingJob sets failed when the blob is missing", async () => {
  const { id, meetings, deps } = await queuedJob(async () => undefined);
  await assert.rejects(() => processMeetingJob(deps, id), /video is missing/);
  const failed = await meetings.get(actor, id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "video is missing");
});
