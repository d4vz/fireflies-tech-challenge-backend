import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { ownerId } from "../../lib/auth/index.ts";
import {
  actionFilter,
  actionListQuerySchema,
  listActions,
  type ActionListQuery,
} from "./actions-query.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import type { Meeting } from "./store.ts";
import type { MeetingTask, TaskStatus } from "./tasks.ts";

const at = new Date("2026-09-01T12:00:00.000Z");
const actor = { id: ownerId("user_a") };

function task(text: string, status: TaskStatus, id = new ObjectId()): MeetingTask {
  return { _id: id, text, status, updatedAt: at };
}

function sampleMeeting(input: {
  sourceId: string;
  createdAt: Date;
  tasks?: MeetingTask[];
  kind?: "video" | "audio";
}): WithId<Meeting> {
  const kind = input.kind ?? "video";
  return {
    _id: new ObjectId(),
    userId: ownerId("user_a"),
    sourceType: "upload",
    sourceId: input.sourceId,
    createdAt: input.createdAt,
    status: "ready",
    tasks: input.tasks,
    blob:
      kind === "audio"
        ? {
            kind: "audio",
            url: "/v",
            durationInSeconds: 1,
            sizeInBytes: 1,
          }
        : {
            kind: "video",
            url: "/v",
            durationInSeconds: 1,
            sizeInBytes: 1,
            thumbnailUrl: "/t",
          },
  };
}

test("actionListQuerySchema defaults page and limit", () => {
  const query = actionListQuerySchema.parse({});
  assert.equal(query.page, 1);
  assert.equal(query.limit, 10);
  assert.equal(query.status, undefined);
});

test("actionListQuerySchema rejects an unknown status", () => {
  assert.throws(() => actionListQuerySchema.parse({ status: "ready" }));
});

test("actionFilter uses hasTasks when status is omitted", () => {
  assert.deepEqual(actionFilter({ page: 1, limit: 10 }), { hasTasks: true });
  assert.deepEqual(actionFilter({ page: 1, limit: 10, status: "pending" }), {
    taskStatus: "pending",
  });
});

test("listActions pages meeting groups and keeps only matching tasks", async () => {
  const newer = sampleMeeting({
    sourceId: "newer.mp4",
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    tasks: [task("open", "pending"), task("done", "completed")],
  });
  const older = sampleMeeting({
    sourceId: "older.mp4",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    tasks: [task("later", "pending")],
  });
  const empty = sampleMeeting({
    sourceId: "empty.mp4",
    createdAt: new Date("2026-09-03T12:00:00.000Z"),
    tasks: [],
  });
  const { meetings } = createMemoryMeetings([newer, older, empty]);
  const query: ActionListQuery = { page: 1, limit: 10, status: "pending" };
  const page = await listActions(meetings, actor, query);
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0]?.sourceId, "newer.mp4");
  assert.equal(page.items[0]?.name, "newer");
  assert.deepEqual(
    page.items[0]?.tasks.map((item) => item.text),
    ["open"],
  );
  assert.equal(page.items[0]?.href, `/meetings/${newer._id.toHexString()}`);
  assert.equal(page.items[0]?.meetingId, newer._id.toHexString());
  assert.equal(page.items[0]?.mediaKind, "video");
  assert.equal(page.items[1]?.sourceId, "older.mp4");
});

test("listActions stamps audio mediaKind from the blob", async () => {
  const meeting = sampleMeeting({
    sourceId: "notes.mp3",
    createdAt: at,
    tasks: [task("listen", "pending")],
    kind: "audio",
  });
  const { meetings } = createMemoryMeetings([meeting]);
  const page = await listActions(meetings, actor, { page: 1, limit: 10 });
  assert.equal(page.items[0]?.mediaKind, "audio");
});

test("listActions skips by page of meeting groups", async () => {
  const first = sampleMeeting({
    sourceId: "a.mp4",
    createdAt: new Date("2026-09-02T12:00:00.000Z"),
    tasks: [task("one", "pending")],
  });
  const second = sampleMeeting({
    sourceId: "b.mp4",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    tasks: [task("two", "pending")],
  });
  const { meetings } = createMemoryMeetings([first, second]);
  const page = await listActions(meetings, actor, { page: 2, limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.sourceId, "b.mp4");
});
