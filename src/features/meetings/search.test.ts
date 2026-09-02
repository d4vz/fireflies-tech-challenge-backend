import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import {
  meetingTranscriptSearchQuerySchema,
  searchMeetingTranscripts,
  searchTranscripts,
} from "./search.ts";
import type { Meeting, MeetingsStore } from "./store.ts";
import type { TranscriptChunkHit, TranscriptsStore } from "./transcripts.ts";

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function sampleMeeting(id: ObjectId, sourceId: string): WithId<Meeting> {
  return {
    _id: id,
    sourceType: "upload",
    sourceId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "failed",
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

test("searchTranscripts ranks by embedding, drops missing meetings, and omits embeddings", async () => {
  const keptId = new ObjectId();
  const goneId = new ObjectId();
  const kept = sampleMeeting(keptId, "interview.mp4");
  const chunks: (TranscriptChunkHit & { embedding: number[] })[] = [
    {
      meetingId: goneId.toHexString(),
      index: 0,
      text: "orphan chunk",
      score: 0,
      embedding: [1, 0],
    },
    {
      meetingId: keptId.toHexString(),
      index: 1,
      text: "we talked about the launch date",
      score: 0,
      embedding: [1, 0],
    },
    {
      meetingId: keptId.toHexString(),
      index: 0,
      text: "unrelated weather chat",
      score: 0,
      embedding: [0, 1],
    },
  ];
  const meetings: MeetingsStore = {
    createId: () => new ObjectId(),
    insert: async () => unused(),
    get: async (id) => (id === keptId.toHexString() ? kept : null),
    list: async () => unused(),
    count: async () => unused(),
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setFailed: async () => unused(),
  };
  const transcripts: TranscriptsStore = {
    insertAll: async () => unused(),
    listByMeeting: async () => unused(),
    searchByEmbedding: async (embedding, limit) =>
      chunks
        .map((chunk) => ({
          meetingId: chunk.meetingId,
          index: chunk.index,
          text: chunk.text,
          score: cosine(embedding, chunk.embedding),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit),
    searchByEmbeddingForMeeting: async () => unused(),
    ensureVectorIndex: async () => unused(),
  };
  const hits = await searchTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    { query: "launch date", limit: 8 },
  );
  assert.equal(hits.length, 2);
  assert.equal(hits[0]?.text, "we talked about the launch date");
  assert.equal(hits[0]?.sourceId, "interview.mp4");
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

test("searchMeetingTranscripts returns [] without embedding when the meeting is missing", async () => {
  const meetingId = new ObjectId().toHexString();
  let embedCalls = 0;
  const meetings: MeetingsStore = {
    createId: () => new ObjectId(),
    insert: async () => unused(),
    get: async () => null,
    list: async () => unused(),
    count: async () => unused(),
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setFailed: async () => unused(),
  };
  const transcripts: TranscriptsStore = {
    insertAll: async () => unused(),
    listByMeeting: async () => unused(),
    searchByEmbedding: async () => unused(),
    searchByEmbeddingForMeeting: async () => unused(),
    ensureVectorIndex: async () => unused(),
  };
  const hits = await searchMeetingTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => {
          embedCalls += 1;
          return [[1, 0]];
        },
      },
    },
    { meetingId, query: "launch date", limit: 8 },
  );
  assert.deepEqual(hits, []);
  assert.equal(embedCalls, 0);
});

test("searchMeetingTranscripts stamps sourceId from the loaded meeting and does not call searchByEmbedding", async () => {
  const meetingId = new ObjectId();
  const otherId = new ObjectId();
  const meeting = sampleMeeting(meetingId, "interview.mp4");
  let corpusCalls = 0;
  const scoped: { meetingId: string; embedding: number[]; limit: number }[] = [];
  const meetings: MeetingsStore = {
    createId: () => new ObjectId(),
    insert: async () => unused(),
    get: async (id) => (id === meetingId.toHexString() ? meeting : null),
    list: async () => unused(),
    count: async () => unused(),
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setFailed: async () => unused(),
  };
  const transcripts: TranscriptsStore = {
    insertAll: async () => unused(),
    listByMeeting: async () => unused(),
    searchByEmbedding: async () => {
      corpusCalls += 1;
      return [];
    },
    searchByEmbeddingForMeeting: async (id, embedding, limit) => {
      scoped.push({ meetingId: id, embedding, limit });
      return [
        {
          meetingId: id,
          index: 1,
          text: "we talked about the launch date",
          score: 0.9,
        },
        {
          meetingId: otherId.toHexString(),
          index: 0,
          text: "wrong meeting",
          score: 0.99,
        },
      ];
    },
    ensureVectorIndex: async () => unused(),
  };
  const hits = await searchMeetingTranscripts(
    {
      meetings,
      transcripts,
      embed: {
        model: "test-embed",
        run: async () => [[1, 0]],
      },
    },
    { meetingId: meetingId.toHexString(), query: "launch date", limit: 8 },
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.text, "we talked about the launch date");
  assert.equal(hits[0]?.sourceId, "interview.mp4");
  assert.equal(hits[0]?.meetingId, meetingId.toHexString());
  assert.equal(hits[0]?.createdAt.toISOString(), "2026-09-01T12:00:00.000Z");
  assert.equal(corpusCalls, 0);
  assert.deepEqual(scoped, [{ meetingId: meetingId.toHexString(), embedding: [1, 0], limit: 8 }]);
});
