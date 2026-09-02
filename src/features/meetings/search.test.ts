import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import { ownerId, type Actor, type OwnerId } from "../../lib/auth/index.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import { createMemoryTranscripts } from "./memory-transcripts.ts";
import { meetingTranscriptSearchQuerySchema, searchTranscripts } from "./search.ts";
import type { Meeting } from "./store.ts";

const actorA: Actor = { id: ownerId("user_a") };

function sampleMeeting(
  id: ObjectId,
  sourceId: string,
  userId: OwnerId = ownerId("user_a"),
): WithId<Meeting> {
  return {
    _id: id,
    userId,
    sourceType: "upload",
    sourceId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "failed",
    blob: {
      kind: "video",
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  };
}

async function seedChunk(
  transcripts: ReturnType<typeof createMemoryTranscripts>,
  meetingId: string,
  index: number,
  text: string,
  embedding: number[],
) {
  await transcripts.insertAll(meetingId, [{ index, text, embedding, model: "test-embed" }]);
}

test("searchTranscripts ranks by embedding, drops missing meetings, and omits embeddings", async () => {
  const keptId = new ObjectId();
  const goneId = new ObjectId();
  const kept = sampleMeeting(keptId, "interview.mp4");
  const { meetings } = createMemoryMeetings([kept]);
  const transcripts = createMemoryTranscripts();
  await seedChunk(transcripts, goneId.toHexString(), 0, "orphan chunk", [1, 0]);
  await seedChunk(transcripts, keptId.toHexString(), 1, "we talked about the launch date", [1, 0]);
  await seedChunk(transcripts, keptId.toHexString(), 0, "unrelated weather chat", [0, 1]);
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    actorA,
    { query: "launch date", limit: 8 },
  );
  assert.equal(hits.length, 2);
  assert.equal(hits[0]?.text, "we talked about the launch date");
  assert.equal(hits[0]?.sourceId, "interview.mp4");
  assert.equal(hits[0]?.name, "interview");
  assert.equal(hits[0]?.meetingId, keptId.toHexString());
  assert.ok(hits[0] !== undefined && hits[0].score > (hits[1]?.score ?? 0));
  assert.equal(
    hits.every((hit) => !Object.hasOwn(hit, "embedding")),
    true,
  );
  assert.equal(
    hits.some((hit) => hit.meetingId === goneId.toHexString()),
    false,
  );
});

test("searchMeetingTranscripts schema rejects a call without meetingId", () => {
  assert.throws(() => meetingTranscriptSearchQuerySchema.parse({ query: "billing", limit: 8 }));
});

test("searchMeetingTranscripts schema rejects an invalid meetingId", () => {
  assert.throws(() =>
    meetingTranscriptSearchQuerySchema.parse({
      meetingId: "not-an-object-id",
      query: "billing",
      limit: 8,
    }),
  );
});

test("searchMeetingTranscripts schema is JSON Schema representable", () => {
  assert.doesNotThrow(() => z.toJSONSchema(meetingTranscriptSearchQuerySchema));
});

test("searchTranscripts returns [] without embedding when the meeting is missing", async () => {
  const meetingId = new ObjectId().toHexString();
  let embedCalls = 0;
  const { meetings } = createMemoryMeetings();
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts: createMemoryTranscripts(),
      embed: {
        model: "test-embed",
        run: async () => {
          embedCalls += 1;
          return [[1, 0]];
        },
      },
    },
    actorA,
    { meetingId, query: "launch date", limit: 8 },
  );
  assert.deepEqual(hits, []);
  assert.equal(embedCalls, 0);
});

test("searchTranscripts with meetingId stamps sourceId and scopes the vector search", async () => {
  const meetingId = new ObjectId();
  const otherId = new ObjectId();
  const meeting = sampleMeeting(meetingId, "interview.mp4");
  const { meetings } = createMemoryMeetings([meeting]);
  const transcripts = createMemoryTranscripts();
  await seedChunk(
    transcripts,
    meetingId.toHexString(),
    1,
    "we talked about the launch date",
    [1, 0],
  );
  await seedChunk(transcripts, otherId.toHexString(), 0, "other meeting secret", [1, 0]);
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    actorA,
    { meetingId: meetingId.toHexString(), query: "launch date", limit: 8 },
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.text, "we talked about the launch date");
  assert.equal(hits[0]?.sourceId, "interview.mp4");
  assert.equal(hits[0]?.name, "interview");
  assert.equal(hits[0]?.meetingId, meetingId.toHexString());
  assert.equal(hits[0]?.createdAt.toISOString(), "2026-09-01T12:00:00.000Z");
});

test("searchTranscripts does not return another user's hit", async () => {
  const mineId = new ObjectId();
  const theirsId = new ObjectId();
  const mine = sampleMeeting(mineId, "mine.mp4", ownerId("user_a"));
  const theirs = sampleMeeting(theirsId, "theirs.mp4", ownerId("user_b"));
  const { meetings } = createMemoryMeetings([mine, theirs]);
  const transcripts = createMemoryTranscripts();
  await seedChunk(transcripts, theirsId.toHexString(), 0, "secret from another user", [1, 0]);
  await seedChunk(transcripts, mineId.toHexString(), 0, "my launch date", [0.5, 0]);
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    actorA,
    { query: "launch date", limit: 8 },
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.text, "my launch date");
  assert.equal(hits[0]?.meetingId, mineId.toHexString());
  assert.equal(
    hits.some((hit) => hit.meetingId === theirsId.toHexString()),
    false,
  );
});

test("searchTranscripts keeps limit after ownership filter", async () => {
  const mineId = new ObjectId();
  const theirsId = new ObjectId();
  const mine = sampleMeeting(mineId, "mine.mp4", ownerId("user_a"));
  const theirs = sampleMeeting(theirsId, "theirs.mp4", ownerId("user_b"));
  const { meetings } = createMemoryMeetings([mine, theirs]);
  const transcripts = createMemoryTranscripts();
  await seedChunk(transcripts, theirsId.toHexString(), 0, "secret closer match", [1, 0]);
  await seedChunk(transcripts, mineId.toHexString(), 0, "my weaker match", [0.2, 0.8]);
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    actorA,
    { query: "secret", limit: 1 },
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.text, "my weaker match");
  assert.equal(hits[0]?.meetingId, mineId.toHexString());
});
