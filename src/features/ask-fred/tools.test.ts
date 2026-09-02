import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { createAskFredTools, listMeetingsToolSchema } from "./tools.ts";
import type { MeetingListQuery } from "../meetings/list-query.ts";
import type { TranscriptSearchQuery } from "../meetings/search.ts";

const executeOptions = {
  toolCallId: "t1",
  messages: [],
  abortSignal: new AbortController().signal,
  context: { unused: true },
};

test("listMeetings tool schema is JSON Schema representable", () => {
  assert.doesNotThrow(() => z.toJSONSchema(listMeetingsToolSchema));
});

test("listMeetings execute does not take sourceId", async () => {
  const seen: MeetingListQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async (query) => {
      seen.push(query);
      return { items: [], total: 0, page: query.page, limit: query.limit };
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const execute = tools.listMeetings.execute;
  assert.ok(execute);
  const input = {
    page: 1,
    limit: 10,
    sourceId: "not-used",
  };
  await execute(input, executeOptions);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.sourceId, undefined);
});

test("listMeetings tool execute maps ISO datetimes onto MeetingListQuery dates", async () => {
  const seen: MeetingListQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async (query) => {
      seen.push(query);
      return { items: [], total: 0, page: query.page, limit: query.limit };
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const execute = tools.listMeetings.execute;
  assert.ok(execute);
  await execute(
    {
      page: 1,
      limit: 10,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    },
    {
      toolCallId: "t-dates",
      messages: [],
      abortSignal: new AbortController().signal,
      context: { unused: true },
    },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.from?.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(seen[0]?.to?.toISOString(), "2026-09-02T00:00:00.000Z");
});

test("listMeetings tool execute calls the injected listMeetings function", async () => {
  const seen: MeetingListQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async (query) => {
      seen.push(query);
      return { items: [], total: 0, page: query.page, limit: query.limit };
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const query = { page: 2, limit: 5, status: "queued" as const };
  const execute = tools.listMeetings.execute;
  assert.ok(execute);
  await execute(query, {
    toolCallId: "t1",
    messages: [],
    abortSignal: new AbortController().signal,
    context: { unused: true },
  });
  assert.deepEqual(seen, [query]);
});

test("searchTranscripts tool execute calls the injected searchTranscripts function", async () => {
  const seen: TranscriptSearchQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async (query) => {
      seen.push(query);
      return [];
    },
  });
  const query: TranscriptSearchQuery = { query: "billing", limit: 8 };
  const execute = tools.searchTranscripts.execute;
  assert.ok(execute);
  await execute(query, {
    toolCallId: "t2",
    messages: [],
    abortSignal: new AbortController().signal,
    context: { unused: true },
  });
  assert.deepEqual(seen, [query]);
});

test("listMeetings tool execute returns JSON-safe meetings with an app href", async () => {
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async (query) => ({
      items: [
        {
          _id: new ObjectId("6a963d4f786296c73b01d6d0"),
          sourceType: "upload",
          sourceId: "screen-recording.webm",
          createdAt: new Date("2026-09-01T03:33:00.000Z"),
          status: "ready",
          summary: { text: "hello", takeaways: [], actionItems: [] },
          blob: {
            url: "http://127.0.0.1:9000/fireflies/meetings/6a963d4f786296c73b01d6d0/video",
            durationInSeconds: 12,
            sizeInBytes: 100,
            thumbnailUrl:
              "http://127.0.0.1:9000/fireflies/meetings/6a963d4f786296c73b01d6d0/thumbnail.jpg",
          },
        },
      ],
      total: 1,
      page: query.page,
      limit: query.limit,
    }),
    searchTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const execute = tools.listMeetings.execute;
  assert.ok(execute);
  const result = await execute({ page: 1, limit: 10 }, executeOptions);
  assert.deepEqual(result, {
    items: [
      {
        id: "6a963d4f786296c73b01d6d0",
        sourceId: "screen-recording.webm",
        createdAt: "2026-09-01T03:33:00.000Z",
        status: "ready",
        href: "/meetings/6a963d4f786296c73b01d6d0",
        summary: { text: "hello", takeaways: [], actionItems: [] },
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
  });
});

test("searchTranscripts tool execute returns JSON-safe hits with an app href", async () => {
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => [
      {
        meetingId: "6a963d4f786296c73b01d6d0",
        sourceId: "screen-recording.webm",
        createdAt: new Date("2026-09-01T03:33:00.000Z"),
        index: 2,
        text: "expanding into new star systems",
        score: 0.91,
      },
    ],
  });
  const execute = tools.searchTranscripts.execute;
  assert.ok(execute);
  const result = await execute({ query: "star systems", limit: 8 }, executeOptions);
  assert.deepEqual(result, [
    {
      meetingId: "6a963d4f786296c73b01d6d0",
      sourceId: "screen-recording.webm",
      createdAt: "2026-09-01T03:33:00.000Z",
      index: 2,
      text: "expanding into new star systems",
      score: 0.91,
      href: "/meetings/6a963d4f786296c73b01d6d0",
    },
  ]);
});
