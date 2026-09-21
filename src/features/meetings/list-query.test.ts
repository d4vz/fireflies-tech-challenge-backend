import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import { ownerId } from "../../lib/auth/index.ts";
import {
  listMeetings,
  meetingFilter,
  meetingListQuerySchema,
  skipOf,
  type MeetingListQuery,
} from "./list-query.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import type { Meeting, MeetingStatus } from "./store.ts";

test("meetingListQuerySchema defaults page to 1 and limit to 10", () => {
  const query = meetingListQuerySchema.parse({});
  assert.equal(query.page, 1);
  assert.equal(query.limit, 10);
  assert.equal(query.from, undefined);
  assert.equal(query.to, undefined);
  assert.equal(query.status, undefined);
  assert.equal(query.sourceId, undefined);
  assert.equal(query.q, undefined);
});

test("meetingListQuerySchema keeps a trimmed text query and drops blank q", () => {
  assert.equal(meetingListQuerySchema.parse({ q: "  standup notes  " }).q, "standup notes");
  assert.equal(meetingListQuerySchema.parse({ q: "   " }).q, undefined);
  assert.equal(meetingListQuerySchema.parse({ q: "" }).q, undefined);
  assert.equal(meetingListQuerySchema.parse({ q: '"standup" -notes' }).q, "standup notes");
});

test("meetingListQuerySchema rejects a text query longer than 200 characters", () => {
  assert.throws(() => meetingListQuerySchema.parse({ q: "n".repeat(201) }));
});

test("meetingListQuerySchema coerces ISO dates", () => {
  const query = meetingListQuerySchema.parse({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-02T00:00:00.000Z",
  });
  assert.equal(query.from?.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(query.to?.toISOString(), "2026-09-02T00:00:00.000Z");
});

test("meetingListQuerySchema rejects from >= to", () => {
  assert.throws(
    () =>
      meetingListQuerySchema.parse({
        from: "2026-09-02T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }),
    (error) =>
      error instanceof z.ZodError &&
      error.issues.some((issue) => issue.message === "from must be before to"),
  );
  assert.throws(
    () =>
      meetingListQuerySchema.parse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }),
    (error) =>
      error instanceof z.ZodError &&
      error.issues.some((issue) => issue.message === "from must be before to"),
  );
});

test("meetingListQuerySchema rejects page 0", () => {
  assert.throws(() => meetingListQuerySchema.parse({ page: 0 }));
  assert.throws(() => meetingListQuerySchema.parse({ page: "0" }));
});

test("meetingListQuerySchema rejects an unknown status", () => {
  assert.throws(() => meetingListQuerySchema.parse({ status: "nope" }));
});

test("meetingListQuerySchema rejects limit 51", () => {
  assert.throws(() => meetingListQuerySchema.parse({ limit: 51 }));
});

function sampleMeeting(input: {
  createdAt: Date;
  status?: MeetingStatus;
  sourceId?: string;
  name?: string;
  summaryText?: string;
}): WithId<Meeting> {
  return {
    _id: new ObjectId(),
    userId: ownerId("user_a"),
    sourceType: "upload",
    sourceId: input.sourceId ?? "interview.mp4",
    name: input.name,
    createdAt: input.createdAt,
    status: input.status ?? "ready",
    summary:
      input.summaryText === undefined ? undefined : { text: input.summaryText, takeaways: [] },
    blob: {
      kind: "video",
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  };
}

test("skipOf is (page - 1) * limit", () => {
  const query: MeetingListQuery = { page: 3, limit: 10 };
  assert.equal(skipOf(query), 20);
});

test("meetingFilter drops page and limit", () => {
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-02T00:00:00.000Z");
  assert.deepEqual(
    meetingFilter({
      page: 2,
      limit: 10,
      from,
      to,
      status: "queued",
      sourceId: "interview.mp4",
      q: "standup",
    }),
    { from, to, status: "queued", sourceId: "interview.mp4", q: "standup" },
  );
});

test("listMeetings shares one filter with list and count and skips by page", async () => {
  const day = new Date("2026-09-01T12:00:00.000Z");
  const before = new Date("2026-08-31T12:00:00.000Z");
  const atTo = new Date("2026-09-02T00:00:00.000Z");
  const matching = [
    sampleMeeting({ createdAt: day, status: "ready", sourceId: "interview.mp4" }),
    sampleMeeting({
      createdAt: new Date("2026-09-01T08:00:00.000Z"),
      status: "ready",
      sourceId: "interview.mp4",
    }),
    sampleMeeting({
      createdAt: new Date("2026-09-01T06:00:00.000Z"),
      status: "ready",
      sourceId: "interview.mp4",
    }),
  ];
  const { meetings } = createMemoryMeetings([
    matching[0],
    matching[1],
    matching[2],
    sampleMeeting({ createdAt: before, status: "ready", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: atTo, status: "ready", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: day, status: "queued", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: day, status: "ready", sourceId: "other.mp4" }),
  ]);
  const actor = { id: ownerId("user_a") };
  const query: MeetingListQuery = {
    page: 2,
    limit: 1,
    from: new Date("2026-09-01T00:00:00.000Z"),
    to: atTo,
    status: "ready",
    sourceId: "interview.mp4",
  };
  const page = await listMeetings(meetings, actor, query);
  assert.equal(page.total, 3);
  assert.equal(page.page, 2);
  assert.equal(page.limit, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?._id.toHexString(), matching[1]!._id.toHexString());
});

test("listMeetings matches title or summary text and keeps newest first", async () => {
  const day = new Date("2026-09-01T12:00:00.000Z");
  const titled = sampleMeeting({
    createdAt: new Date("2026-09-01T18:00:00.000Z"),
    name: "Weekly standup",
  });
  const summarized = sampleMeeting({
    createdAt: day,
    name: "Design review",
    summaryText: "We agreed to ship the standup bot next week.",
  });
  const other = sampleMeeting({
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    name: "Payroll",
    summaryText: "Benefits enrollment closes Friday.",
  });
  const { meetings } = createMemoryMeetings([titled, summarized, other]);
  const actor = { id: ownerId("user_a") };
  const page = await listMeetings(meetings, actor, { page: 1, limit: 10, q: "standup" });
  assert.equal(page.total, 2);
  assert.deepEqual(
    page.items.map((item) => item.name),
    ["Weekly standup", "Design review"],
  );
});

test("listMeetings text query does not return another user's meeting", async () => {
  const mine = sampleMeeting({ createdAt: new Date(), name: "Standup" });
  const theirs = sampleMeeting({ createdAt: new Date(), name: "Standup" });
  theirs.userId = ownerId("user_b");
  const { meetings } = createMemoryMeetings([mine, theirs]);
  const page = await listMeetings(
    meetings,
    { id: ownerId("user_a") },
    {
      page: 1,
      limit: 10,
      q: "standup",
    },
  );
  assert.equal(page.total, 1);
  assert.equal(page.items[0]?._id.toHexString(), mine._id.toHexString());
});
