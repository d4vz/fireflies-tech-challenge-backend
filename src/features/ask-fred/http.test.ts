import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError, ownerId, type AuthVerify } from "../../lib/auth/index.ts";
import { createApp, type CreateAppDeps } from "../../create-app.ts";
import { parseSettings } from "../../lib/config/index.ts";
import { createMemoryMeetings } from "../meetings/memory-meetings.ts";
import { ASK_FRED_REASONING_EFFORT } from "./http.ts";

const settings = parseSettings(`
chunkSize: 500
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

function unused(): never {
  throw new Error("unused");
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

function testDeps(): CreateAppDeps {
  const { meetings } = createMemoryMeetings();
  return {
    video: {
      extract: async () => unused(),
      slice: async () => unused(),
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
      ensureVectorIndex: async () => undefined,
    },
    queue: { enqueue: async () => undefined },
    settings,
    embed: { model: "test-embed", run: async () => [] },
    model: "openai/gpt-4o-mini",
    auth: testAuth(),
  };
}

test("AskFred uses medium reasoning", () => {
  assert.equal(ASK_FRED_REASONING_EFFORT, "medium");
});

test("POST /ask-fred without Authorization returns 401", async () => {
  const app = createApp(testDeps());
  const res = await app.request("/ask-fred", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    }),
  });
  assert.equal(res.status, 401);
});

test("POST /ask-fred returns 400 without FRONTEND_ORIGIN", async () => {
  const app = createApp(testDeps());
  const res = await app.request("/ask-fred", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer user_a" },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid origin" });
});

test("POST /ask-fred does not take origin from request headers", async () => {
  const app = createApp(testDeps());
  const res = await app.request("/ask-fred", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer user_a",
      origin: "http://localhost:8080",
      "x-app-origin": "http://localhost:8080",
    },
    body: JSON.stringify({
      messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid origin" });
});

test("POST /ask-fred returns 400 for an invalid body", async () => {
  const app = createApp(testDeps());
  const res = await app.request("/ask-fred", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer user_a" },
    body: JSON.stringify({ messages: "nope" }),
  });
  assert.equal(res.status, 400);
});
