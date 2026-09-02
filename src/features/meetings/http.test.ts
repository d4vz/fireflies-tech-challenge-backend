import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { AuthError, ownerId, type AuthVerify, type OwnerId } from "../../lib/auth/index.ts";
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

function sampleMeeting(sourceId: string, userId: OwnerId = ownerId("user_a")): WithId<Meeting> {
  return {
    _id: new ObjectId(),
    userId,
    sourceType: "upload",
    sourceId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "ready",
    blob: {
      kind: "video",
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

function bearerAuth(userId: string | OwnerId) {
  return { Authorization: `Bearer ${userId}` };
}

function testAuth(): AuthVerify {
  return {
    verifyBearer: async (authorizationHeader) => {
      const prefix = "Bearer ";
      if (authorizationHeader === undefined || !authorizationHeader.startsWith(prefix)) {
        throw new AuthError();
      }
      const token = authorizationHeader.slice(prefix.length);
      if (token === "") {
        throw new AuthError();
      }
      return { id: ownerId(token) };
    },
  };
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

function testDeps(meetings: MeetingsStore, blobGet?: CreateAppDeps["blob"]["get"]): CreateAppDeps {
  return {
    video: {
      extract: async () => unused(),
      durationInSeconds: async () => unused(),
      thumbnail: async () => unused(),
    },
    blob: {
      put: async () => unused(),
      get: blobGet ?? (async () => undefined),
      ping: async () => undefined,
    },
    transcribe: { run: async () => unused(), ping: async () => undefined },
    meetings,
    transcripts: {
      insertAll: async () => unused(),
      listByMeeting: async () => [],
      searchByEmbedding: async () => [],
      ensureVectorIndex: async () => undefined,
    },
    queue: { enqueue: async () => undefined },
    settings,
    embed: { model: "test-embed", run: async () => [] },
    model: "openai/gpt-4o-mini",
    auth: testAuth(),
  };
}

test("GET /health is public", async () => {
  const app = createApp(testDeps(fakeMeetingsStore([])));
  const res = await app.request("/health");
  assert.equal(res.status, 200);
});

test("GET /meetings without Authorization returns 401", async () => {
  const app = createApp(testDeps(fakeMeetingsStore([])));
  const res = await app.request("/meetings");
  assert.equal(res.status, 401);
});

test("GET /meetings as another user returns 404 for that meeting", async () => {
  const meeting = sampleMeeting("keep.mp4", ownerId("user_a"));
  const app = createApp(testDeps(fakeMeetingsStore([meeting])));
  const res = await app.request(`/meetings/${meeting._id.toHexString()}`, {
    headers: bearerAuth("user_b"),
  });
  assert.equal(res.status, 404);
});

test("GET /meetings validates query and lists through listMeetings", async () => {
  const items = [sampleMeeting("a.mp4"), sampleMeeting("b.mp4")];
  const meetings = fakeMeetingsStore(items);
  const app = createApp(testDeps(meetings));
  const res = await app.request("/meetings?page=1&limit=10&status=ready", {
    headers: bearerAuth(items[0]!.userId),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
  assert.equal(body.total, 2);
  assert.equal(body.items.length, 2);
  assert.deepEqual(meetings.listCalls[0]?.filter, { status: "ready", userId: items[0]!.userId });
});

test("GET /meetings defaults page and limit", async () => {
  const meetings = fakeMeetingsStore([]);
  const app = createApp(testDeps(meetings));
  const res = await app.request("/meetings", { headers: bearerAuth("user_a") });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
  assert.deepEqual(meetings.listCalls[0], {
    skip: 0,
    limit: 10,
    filter: { userId: ownerId("user_a") },
  });
});

test("GET /meetings returns 400 for an invalid query", async () => {
  const headers = bearerAuth("user_a");
  const app = createApp(testDeps(fakeMeetingsStore([])));
  const page = await app.request("/meetings?page=0", { headers });
  assert.equal(page.status, 400);
  const limit = await app.request("/meetings?limit=51", { headers });
  assert.equal(limit.status, 400);
  const status = await app.request("/meetings?status=nope", { headers });
  assert.equal(status.status, 400);
  const range = await app.request(
    "/meetings?from=2026-09-02T00:00:00.000Z&to=2026-09-01T00:00:00.000Z",
    { headers },
  );
  assert.equal(range.status, 400);
});

test("GET /meetings/:id still returns a meeting", async () => {
  const meeting = sampleMeeting("keep.mp4");
  const app = createApp(testDeps(fakeMeetingsStore([meeting])));
  const res = await app.request(`/meetings/${meeting._id.toHexString()}`, {
    headers: bearerAuth(meeting.userId),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sourceId, "keep.mp4");
});

test("GET /meetings/:id/video as another user returns 404 without reading the blob", async () => {
  const meeting = sampleMeeting("keep.mp4", ownerId("user_a"));
  let blobGets = 0;
  const app = createApp(
    testDeps(fakeMeetingsStore([meeting]), async () => {
      blobGets += 1;
      return {
        body: new ReadableStream(),
        contentType: "video/mp4",
      };
    }),
  );
  const res = await app.request(`/meetings/${meeting._id.toHexString()}/video`, {
    headers: bearerAuth("user_b"),
  });
  assert.equal(res.status, 404);
  assert.equal(blobGets, 0);
});

test("GET /meetings/:id/thumbnail as another user returns 404 without reading the blob", async () => {
  const meeting = sampleMeeting("keep.mp4", ownerId("user_a"));
  let blobGets = 0;
  const app = createApp(
    testDeps(fakeMeetingsStore([meeting]), async () => {
      blobGets += 1;
      return {
        body: new ReadableStream(),
        contentType: "image/jpeg",
      };
    }),
  );
  const res = await app.request(`/meetings/${meeting._id.toHexString()}/thumbnail`, {
    headers: bearerAuth("user_b"),
  });
  assert.equal(res.status, 404);
  assert.equal(blobGets, 0);
});

test("GET /meetings/:id/transcripts as another user returns 404", async () => {
  const meeting = sampleMeeting("keep.mp4", ownerId("user_a"));
  const app = createApp(testDeps(fakeMeetingsStore([meeting])));
  const res = await app.request(`/meetings/${meeting._id.toHexString()}/transcripts`, {
    headers: bearerAuth("user_b"),
  });
  assert.equal(res.status, 404);
});
