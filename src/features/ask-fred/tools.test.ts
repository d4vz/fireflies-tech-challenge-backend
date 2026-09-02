import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ownerId } from "../../lib/auth/index.ts";
import { createAskFredTools, listActionsToolSchema, listMeetingsToolSchema } from "./tools.ts";
import type { ActionListQuery } from "../meetings/actions-query.ts";
import type { MeetingListQuery } from "../meetings/list-query.ts";
import {
  meetingTranscriptSearchQuerySchema,
  type MeetingTranscriptSearchQuery,
  type TranscriptSearchQuery,
} from "../meetings/search.ts";

const executeOptions = {
  toolCallId: "t1",
  messages: [],
  abortSignal: new AbortController().signal,
  context: { unused: true },
};

test("listMeetings tool schema is JSON Schema representable", () => {
  assert.doesNotThrow(() => z.toJSONSchema(listMeetingsToolSchema));
});

test("listActions tool schema is JSON Schema representable", () => {
  assert.doesNotThrow(() => z.toJSONSchema(listActionsToolSchema));
});

test("searchMeetingTranscripts tool schema is JSON Schema representable", () => {
  assert.doesNotThrow(() => z.toJSONSchema(meetingTranscriptSearchQuerySchema));
});

test("listMeetings execute does not take sourceId", async () => {
  const seen: MeetingListQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async (query) => {
      seen.push(query);
      return { items: [], total: 0, page: query.page, limit: query.limit };
    },
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
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
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
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
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
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
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async (query) => {
      seen.push(query);
      return [];
    },
    searchMeetingTranscripts: async () => {
      throw new Error("unused");
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
          userId: ownerId("user_a"),
          sourceType: "upload",
          sourceId: "screen-recording.webm",
          createdAt: new Date("2026-09-01T03:33:00.000Z"),
          status: "ready",
          summary: { text: "hello", takeaways: [] },
          blob: {
            kind: "video",
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
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
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
        summary: { text: "hello", takeaways: [] },
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
    listActions: async () => {
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
    searchMeetingTranscripts: async () => {
      throw new Error("unused");
    },
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

test("searchMeetingTranscripts execute forwards meetingId and query", async () => {
  const seen: MeetingTranscriptSearchQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async (query) => {
      seen.push(query);
      return [];
    },
  });
  const execute = tools.searchMeetingTranscripts.execute;
  assert.ok(execute);
  await execute(
    { meetingId: "6a963d4f786296c73b01d6d0", query: "billing", limit: 8 },
    executeOptions,
  );
  assert.deepEqual(seen, [{ meetingId: "6a963d4f786296c73b01d6d0", query: "billing", limit: 8 }]);
});

test("searchMeetingTranscripts tool execute returns JSON-safe hits with an app href", async () => {
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    listActions: async () => {
      throw new Error("unused");
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => [
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
  const execute = tools.searchMeetingTranscripts.execute;
  assert.ok(execute);
  const result = await execute(
    { meetingId: "6a963d4f786296c73b01d6d0", query: "star systems", limit: 8 },
    executeOptions,
  );
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

test("listActions tool execute calls the injected listActions function", async () => {
  const seen: ActionListQuery[] = [];
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    listActions: async (query) => {
      seen.push(query);
      return { items: [], total: 0, page: query.page, limit: query.limit };
    },
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const execute = tools.listActions.execute;
  assert.ok(execute);
  await execute({ page: 1, limit: 10, status: "pending" }, executeOptions);
  assert.deepEqual(seen, [{ page: 1, limit: 10, status: "pending" }]);
});

test("listActions tool execute returns grouped JSON-safe tasks", async () => {
  const tools = createAskFredTools({
    model: "openai/gpt-4o-mini",
    listMeetings: async () => {
      throw new Error("unused");
    },
    listActions: async (query) => ({
      items: [
        {
          meetingId: "6a963d4f786296c73b01d6d0",
          sourceId: "screen-recording.webm",
          createdAt: "2026-09-01T03:33:00.000Z",
          href: "/meetings/6a963d4f786296c73b01d6d0",
          mediaKind: "video",
          tasks: [
            {
              _id: "6a963d4f786296c73b01d6d1",
              text: "review notes",
              status: "pending",
              updatedAt: "2026-09-01T03:33:00.000Z",
            },
          ],
        },
      ],
      total: 1,
      page: query.page,
      limit: query.limit,
    }),
    searchTranscripts: async () => {
      throw new Error("unused");
    },
    searchMeetingTranscripts: async () => {
      throw new Error("unused");
    },
  });
  const execute = tools.listActions.execute;
  assert.ok(execute);
  const grouped = await execute({ page: 1, limit: 10 }, executeOptions);
  assert.deepEqual(grouped, {
    items: [
      {
        meetingId: "6a963d4f786296c73b01d6d0",
        sourceId: "screen-recording.webm",
        createdAt: "2026-09-01T03:33:00.000Z",
        href: "/meetings/6a963d4f786296c73b01d6d0",
        mediaKind: "video",
        tasks: [
          {
            _id: "6a963d4f786296c73b01d6d1",
            text: "review notes",
            status: "pending",
            updatedAt: "2026-09-01T03:33:00.000Z",
          },
        ],
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
  });
});
