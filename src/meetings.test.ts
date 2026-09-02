import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import type { PutBlob } from "./lib/blob/index.ts";
import { loadSettings, settingsFileUrl } from "./lib/config/index.ts";
import type { Meeting } from "./features/meetings/store.ts";
import { uploadFileSchema } from "./features/meetings/upload-file.ts";
import { createApp, type CreateAppDeps } from "./create-app.ts";

const meetingId = "67a1b2c3d4e5f678901234ab";
const settings = await loadSettings(settingsFileUrl);
const summary = { text: "recap", takeaways: ["takeaway"], actionItems: ["follow up"] };

type SseEvent = {
  event: string;
  data: ReturnType<typeof JSON.parse>;
};

function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim() === "") {
      continue;
    }
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length === 0) {
      continue;
    }
    events.push({ event, data: JSON.parse(dataLines.join("\n")) });
  }
  return events;
}

function idleMeetings(
  overrides: Partial<{
    createId: () => ObjectId;
    insert: (meeting: WithId<Meeting>) => Promise<void>;
    list: () => Promise<WithId<Meeting>[]>;
  }> = {},
) {
  return {
    createId: () => new ObjectId(meetingId),
    insert: async () => {},
    list: async () => [],
    ...overrides,
  };
}

function idleApp(overrides: Partial<CreateAppDeps> = {}) {
  return createApp({
    video: {
      extract: async () => new File(["audio-bytes"], "clip.mp3", { type: "audio/mpeg" }),
      durationInSeconds: async () => 12,
      thumbnail: async () => new File(["thumb-bytes"], "thumb.jpg", { type: "image/jpeg" }),
    },
    blob: { put: async (input) => `https://blob.test/${input.key}`, ping: async () => {} },
    transcribe: { run: async () => ({ text: "hello from the recording" }), ping: async () => {} },
    summarize: { run: async () => summary },
    meetings: idleMeetings(),
    settings,
    ...overrides,
  });
}

test("POST /meetings/upload streams storing, transcribing, summarizing, saving, then the meeting", async () => {
  const uploaded = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
  const stored = new Map<string, PutBlob>();
  let inserted: WithId<Meeting> | undefined;

  const app = idleApp({
    blob: {
      put: async (input) => {
        stored.set(input.key, input);
        return `https://blob.test/${input.key}`;
      },
      ping: async () => {},
    },
    meetings: idleMeetings({
      insert: async (meeting) => {
        inserted = meeting;
      },
    }),
  });

  const form = new FormData();
  form.set("file", uploaded);

  const res = await app.request("/meetings/upload", {
    method: "POST",
    body: form,
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

  const events = parseSse(await res.text());
  assert.deepEqual(
    events.map((item) => item.event),
    ["progress", "progress", "progress", "progress", "done"],
  );
  assert.deepEqual(
    events.slice(0, 4).map((item) => item.data.stage),
    ["storing", "transcribing", "summarizing", "saving"],
  );

  const body = events[4]?.data;
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
  assert.deepEqual(body.summary, summary);
  assert.deepEqual(body.blob, {
    url: `https://blob.test/meetings/${meetingId}/video`,
    durationInSeconds: 12,
    sizeInBytes: 11,
    thumbnailUrl: `https://blob.test/meetings/${meetingId}/thumbnail.jpg`,
  });
  assert.equal(stored.get(`meetings/${meetingId}/video`)?.contentType, "video/mp4");
  assert.equal(stored.get(`meetings/${meetingId}/thumbnail.jpg`)?.contentType, "image/jpeg");
  assert.equal(inserted?._id.toHexString(), meetingId);
  assert.deepEqual(inserted?.summary, summary);
});

test("POST /meetings/upload records two chunks when the transcript is longer than chunkSize", async () => {
  const uploaded = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
  const text = "a".repeat(501);

  const app = idleApp({
    transcribe: { run: async () => ({ text }), ping: async () => {} },
  });

  const form = new FormData();
  form.set("file", uploaded);
  const res = await app.request("/meetings/upload", { method: "POST", body: form });
  const events = parseSse(await res.text());
  const done = events.find((item) => item.event === "done");
  const body = done?.data;

  assert.equal(res.status, 200);
  assert.equal(body.transcript.chunkSize, 500);
  assert.equal(body.transcript.chunkCount, 2);
  assert.equal(body.transcript.charLength, 501);
});

test("POST /meetings/upload returns 400 when file is missing", async () => {
  const res = await idleApp().request("/meetings/upload", {
    method: "POST",
    body: new FormData(),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "file is required" });
});

test("uploadFileSchema rejects files over maxFileBytes", () => {
  const uploaded = new File(["x"], "clip.mp4", { type: "video/mp4" });
  Object.defineProperty(uploaded, "size", { value: settings.upload.maxFileBytes + 1 });
  const parsed = uploadFileSchema(settings.upload).safeParse(uploaded);

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(parsed.error.issues[0]?.message, "file must be 5 GB or smaller");
  }
});

test("POST /meetings/upload returns 400 when the file format is not supported", async () => {
  const form = new FormData();
  form.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }));

  const res = await idleApp().request("/meetings/upload", { method: "POST", body: form });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "file format is not supported" });
});

test("POST /meetings/upload streams the failure when processing throws", async () => {
  const app = idleApp({
    video: {
      extract: async () => {
        throw new Error("ffmpeg: Output file does not contain any stream");
      },
      durationInSeconds: async () => 1,
      thumbnail: async () => new File(["thumb-bytes"], "thumb.jpg", { type: "image/jpeg" }),
    },
  });

  const form = new FormData();
  form.set("file", new File(["video-bytes"], "clip.mp4", { type: "video/mp4" }));
  const res = await app.request("/meetings/upload", { method: "POST", body: form });
  const events = parseSse(await res.text());
  const last = events.at(-1);

  assert.equal(res.status, 200);
  assert.equal(last?.event, "error");
  assert.deepEqual(last?.data, { error: "ffmpeg: Output file does not contain any stream" });
});

test("GET /meetings returns the store list", async () => {
  const meetings: WithId<Meeting>[] = [
    {
      _id: new ObjectId("67a1b2c3d4e5f678901234ab"),
      sourceType: "upload",
      sourceId: "newer.mp4",
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
      transcript: { text: "hi", chunkSize: 500, chunkCount: 1, charLength: 2 },
      summary,
      blob: {
        url: "https://blob.test/newer",
        durationInSeconds: 1,
        sizeInBytes: 1,
        thumbnailUrl: "https://blob.test/newer.jpg",
      },
    },
  ];

  const res = await idleApp({
    meetings: idleMeetings({
      list: async () => meetings,
    }),
  }).request("/meetings");
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].sourceId, "newer.mp4");
  assert.equal(body[0].transcript.text, "hi");
  assert.deepEqual(body[0].summary, summary);
});
