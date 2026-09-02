import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { createApp, type CreateAppDeps } from "../../create-app.ts";
import { parseSettings } from "../../lib/config/index.ts";
import type { MeetingFilter } from "./list-query.ts";
import type { Meeting, MeetingsStore } from "./store.ts";

const settings = parseSettings(`
chunkSize: 500
models:
  transcribe: gpt-4o-transcribe
  summary: gpt-4o-mini
  embed: text-embedding-3-small
  chat: gpt-4o-mini
upload:
  maxFileBytes: 100
  mimeTypes:
    - video/mp4
  extensions:
    - mp4
`);

function sampleMeeting(sourceId: string): WithId<Meeting> {
  return {
    _id: new ObjectId(),
    sourceType: "upload",
    sourceId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "ready",
    blob: {
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  };
}

function unused(): never {
  throw new Error("unused");
}

function fakeMeetingsStore(items: WithId<Meeting>[]): MeetingsStore & {
  listCalls: { skip: number; limit: number; filter: MeetingFilter }[];
} {
  const listCalls: { skip: number; limit: number; filter: MeetingFilter }[] = [];
  return {
    listCalls,
    createId: () => new ObjectId(),
    insert: async () => unused(),
    get: async (id) => items.find((item) => item._id.toHexString() === id) ?? null,
    list: async (skip, limit, filter) => {
      listCalls.push({ skip, limit, filter });
      return items.slice(skip, skip + limit);
    },
    count: async () => items.length,
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setFailed: async () => unused(),
  };
}

function testDeps(meetings: MeetingsStore): CreateAppDeps {
  return {
    video: {
      extract: async () => unused(),
      durationInSeconds: async () => unused(),
      thumbnail: async () => unused(),
    },
    blob: { put: async () => unused(), get: async () => undefined, ping: async () => undefined },
    transcribe: { run: async () => unused(), ping: async () => undefined },
    meetings,
    transcripts: {
      insertAll: async () => unused(),
      listByMeeting: async () => [],
      searchByEmbedding: async () => [],
      searchByEmbeddingForMeeting: async () => [],
      ensureVectorIndex: async () => undefined,
    },
    queue: { enqueue: async () => undefined },
    settings,
    embed: { model: "test-embed", run: async () => [] },
    model: "openai/gpt-4o-mini",
  };
}

test("GET /meetings validates query and lists through listMeetings", async () => {
  const items = [sampleMeeting("a.mp4"), sampleMeeting("b.mp4")];
  const meetings = fakeMeetingsStore(items);
  const app = createApp(testDeps(meetings));
  const res = await app.request("/meetings?page=1&limit=10&status=ready");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
  assert.equal(body.total, 2);
  assert.equal(body.items.length, 2);
  assert.deepEqual(meetings.listCalls[0]?.filter, { status: "ready" });
});

test("GET /meetings defaults page and limit", async () => {
  const meetings = fakeMeetingsStore([]);
  const app = createApp(testDeps(meetings));
  const res = await app.request("/meetings");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
  assert.deepEqual(meetings.listCalls[0], { skip: 0, limit: 10, filter: {} });
});

test("GET /meetings returns 400 for an invalid query", async () => {
  const app = createApp(testDeps(fakeMeetingsStore([])));
  const page = await app.request("/meetings?page=0");
  assert.equal(page.status, 400);
  const limit = await app.request("/meetings?limit=51");
  assert.equal(limit.status, 400);
  const status = await app.request("/meetings?status=nope");
  assert.equal(status.status, 400);
  const range = await app.request(
    "/meetings?from=2026-09-02T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
  );
  assert.equal(range.status, 400);
});

test("GET /meetings/:id still returns a meeting", async () => {
  const meeting = sampleMeeting("keep.mp4");
  const app = createApp(testDeps(fakeMeetingsStore([meeting])));
  const res = await app.request(`/meetings/${meeting._id.toHexString()}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sourceId, "keep.mp4");
});
