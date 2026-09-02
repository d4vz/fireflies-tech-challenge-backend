import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import {
  listMeetings,
  meetingFilter,
  meetingListQuerySchema,
  skipOf,
  type MeetingFilter,
  type MeetingListQuery,
} from "./list-query.ts";
import type { Meeting, MeetingStatus, MeetingsStore } from "./store.ts";
import { ownerId } from "../../lib/auth/index.ts";

test("meetingListQuerySchema defaults page to 1 and limit to 10", () => {
  const query = meetingListQuerySchema.parse({});
  assert.equal(query.page, 1);
  assert.equal(query.limit, 10);
  assert.equal(query.from, undefined);
  assert.equal(query.to, undefined);
  assert.equal(query.status, undefined);
  assert.equal(query.sourceId, undefined);
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
}): WithId<Meeting> {
  return {
    _id: new ObjectId(),
    userId: ownerId("user_a"),
    sourceType: "upload",
    sourceId: input.sourceId ?? "interview.mp4",
    createdAt: input.createdAt,
    status: input.status ?? "ready",
    blob: {
      kind: "video",
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  };
}

function matchesFilter(meeting: WithId<Meeting>, filter: MeetingFilter): boolean {
  if (filter.status !== undefined && meeting.status !== filter.status) {
    return false;
  }
  if (filter.sourceId !== undefined && meeting.sourceId !== filter.sourceId) {
    return false;
  }
  if (filter.from !== undefined && meeting.createdAt < filter.from) {
    return false;
  }
  if (filter.to !== undefined && meeting.createdAt >= filter.to) {
    return false;
  }
  return true;
}

function fakeMeetingsStore(items: WithId<Meeting>[]): MeetingsStore & {
  listFilters: MeetingFilter[];
  countFilters: MeetingFilter[];
} {
  const listFilters: MeetingFilter[] = [];
  const countFilters: MeetingFilter[] = [];
  return {
    listFilters,
    countFilters,
    createId: () => new ObjectId(),
    insert: async () => {
      throw new Error("unused");
    },
    get: async () => {
      throw new Error("unused");
    },
    list: async (skip, limit, filter) => {
      listFilters.push(filter);
      return items
        .filter((item) => matchesFilter(item, filter))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(skip, skip + limit);
    },
    count: async (filter) => {
      countFilters.push(filter);
      return items.filter((item) => matchesFilter(item, filter)).length;
    },
    setStatus: async () => {
      throw new Error("unused");
    },
    setReady: async () => {
      throw new Error("unused");
    },
    setFailed: async () => {
      throw new Error("unused");
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
    }),
    { from, to, status: "queued", sourceId: "interview.mp4" },
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
  const store = fakeMeetingsStore([
    matching[0],
    matching[1],
    matching[2],
    sampleMeeting({ createdAt: before, status: "ready", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: atTo, status: "ready", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: day, status: "queued", sourceId: "interview.mp4" }),
    sampleMeeting({ createdAt: day, status: "ready", sourceId: "other.mp4" }),
  ]);
  const query: MeetingListQuery = {
    page: 2,
    limit: 1,
    from: new Date("2026-09-01T00:00:00.000Z"),
    to: atTo,
    status: "ready",
    sourceId: "interview.mp4",
  };
  const page = await listMeetings(store, query);
  assert.deepEqual(store.listFilters, [meetingFilter(query)]);
  assert.deepEqual(store.countFilters, [meetingFilter(query)]);
  assert.deepEqual(store.listFilters[0], store.countFilters[0]);
  assert.equal(page.total, 3);
  assert.equal(page.page, 2);
  assert.equal(page.limit, 1);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?._id.toHexString(), matching[1]._id.toHexString());
});
