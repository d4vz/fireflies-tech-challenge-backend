import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { ownerId, type Actor } from "../../lib/auth/index.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import type { MeetingDraft, Meetings, MeetingsStore } from "./store.ts";
import type { MeetingTask } from "./tasks.ts";

const userA: Actor = { id: ownerId("user_a") };
const userB: Actor = { id: ownerId("user_b") };
const day = new Date("2026-09-01T12:00:00.000Z");

function videoBlob() {
  return {
    kind: "video" as const,
    url: "/v",
    durationInSeconds: 1,
    sizeInBytes: 1,
    thumbnailUrl: "/t",
  };
}

function draft(sourceId: string, createdAt = day): MeetingDraft {
  return {
    _id: new ObjectId(),
    sourceType: "upload",
    sourceId,
    createdAt,
    status: "queued",
    blob: videoBlob(),
  };
}

function pendingTask(text: string): MeetingTask {
  return {
    _id: new ObjectId(),
    text,
    status: "pending",
    updatedAt: day,
  };
}

function runMeetingsContract(
  name: string,
  factory: () => { meetings: Meetings; store: MeetingsStore },
) {
  test(`${name} get returns null for another user's meeting`, async () => {
    const { meetings } = factory();
    const row = draft("keep.mp4");
    await meetings.insert(userA, row);
    assert.equal(await meetings.get(userB, row._id.toHexString()), null);
    assert.equal((await meetings.get(userA, row._id.toHexString()))?.sourceId, "keep.mp4");
  });

  test(`${name} get returns null for an invalid id`, async () => {
    const { meetings } = factory();
    assert.equal(await meetings.get(userA, "not-an-id"), null);
  });

  test(`${name} list and count stay inside the actor`, async () => {
    const { meetings } = factory();
    await meetings.insert(userA, draft("mine.mp4"));
    await meetings.insert(userB, draft("theirs.mp4"));
    const items = await meetings.list(userA, 0, 10, { status: "queued" });
    assert.equal(items.length, 1);
    assert.equal(items[0]?.sourceId, "mine.mp4");
    assert.equal(await meetings.count(userA, { status: "queued" }), 1);
  });

  test(`${name} insert stamps actor.id`, async () => {
    const { meetings } = factory();
    const row = draft("clip.mp4");
    await meetings.insert(userA, row);
    const got = await meetings.get(userA, row._id.toHexString());
    assert.equal(got?.userId, userA.id);
    assert.equal(await meetings.get(userB, row._id.toHexString()), null);
  });

  test(`${name} list uses exclusive to and newest first`, async () => {
    const { meetings } = factory();
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-02T00:00:00.000Z");
    await meetings.insert(userA, draft("old.mp4", new Date("2026-08-31T12:00:00.000Z")));
    await meetings.insert(userA, draft("early.mp4", new Date("2026-09-01T08:00:00.000Z")));
    await meetings.insert(userA, draft("late.mp4", new Date("2026-09-01T18:00:00.000Z")));
    await meetings.insert(userA, draft("boundary.mp4", to));
    const items = await meetings.list(userA, 0, 10, { from, to });
    assert.deepEqual(
      items.map((item) => item.sourceId),
      ["late.mp4", "early.mp4"],
    );
  });

  test(`${name} list pages after skip`, async () => {
    const { meetings } = factory();
    await meetings.insert(userA, draft("newer.mp4", new Date("2026-09-02T12:00:00.000Z")));
    await meetings.insert(userA, draft("older.mp4", new Date("2026-09-01T12:00:00.000Z")));
    const items = await meetings.list(userA, 1, 1, {});
    assert.equal(items.length, 1);
    assert.equal(items[0]?.sourceId, "older.mp4");
  });

  test(`${name} list matches hasTasks and taskStatus`, async () => {
    const { meetings } = factory();
    const withPending = draft("pending.mp4");
    withPending.tasks = [pendingTask("open")];
    const withDone = draft("done.mp4");
    withDone.tasks = [{ ...pendingTask("done"), status: "completed" }];
    const empty = draft("empty.mp4");
    empty.tasks = [];
    await meetings.insert(userA, withPending);
    await meetings.insert(userA, withDone);
    await meetings.insert(userA, empty);
    assert.equal(await meetings.count(userA, { hasTasks: true }), 2);
    const pending = await meetings.list(userA, 0, 10, { taskStatus: "pending" });
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.sourceId, "pending.mp4");
  });

  test(`${name} setTaskStatus updates one owned task`, async () => {
    const { meetings } = factory();
    const task = pendingTask("review notes");
    const row = draft("keep.mp4");
    row.tasks = [task];
    await meetings.insert(userA, row);
    const at = new Date("2026-09-02T00:00:00.000Z");
    const result = await meetings.setTaskStatus(
      userA,
      row._id.toHexString(),
      task._id.toHexString(),
      "completed",
      at,
    );
    assert.equal(result.kind, "updated");
    if (result.kind !== "updated") {
      return;
    }
    assert.equal(result.task.status, "completed");
    assert.equal(result.task.updatedAt.toISOString(), at.toISOString());
    const got = await meetings.get(userA, row._id.toHexString());
    assert.equal(got?.tasks?.[0]?.status, "completed");
  });

  test(`${name} setTaskStatus is a no-op when status matches`, async () => {
    const { meetings } = factory();
    const task: MeetingTask = {
      _id: new ObjectId(),
      text: "review notes",
      status: "completed",
      updatedAt: day,
    };
    const row = draft("keep.mp4");
    row.tasks = [task];
    await meetings.insert(userA, row);
    const result = await meetings.setTaskStatus(
      userA,
      row._id.toHexString(),
      task._id.toHexString(),
      "completed",
      new Date("2026-09-02T00:00:00.000Z"),
    );
    assert.equal(result.kind, "unchanged");
    if (result.kind !== "unchanged") {
      return;
    }
    assert.equal(result.task.updatedAt.toISOString(), day.toISOString());
  });

  test(`${name} setTaskStatus returns missing for another user`, async () => {
    const { meetings } = factory();
    const task = pendingTask("review notes");
    const row = draft("keep.mp4");
    row.tasks = [task];
    await meetings.insert(userA, row);
    const result = await meetings.setTaskStatus(
      userB,
      row._id.toHexString(),
      task._id.toHexString(),
      "completed",
      new Date(),
    );
    assert.equal(result.kind, "missing");
    const got = await meetings.get(userA, row._id.toHexString());
    assert.equal(got?.tasks?.[0]?.status, "pending");
  });

  test(`${name} owner setFailed is visible; another actor cannot fail it`, async () => {
    const { meetings } = factory();
    const row = draft("keep.mp4");
    await meetings.insert(userA, row);
    await meetings.setFailed(userB, row._id.toHexString(), "nope");
    assert.equal((await meetings.get(userA, row._id.toHexString()))?.status, "queued");
    await meetings.setFailed(userA, row._id.toHexString(), "queue failed");
    const got = await meetings.get(userA, row._id.toHexString());
    assert.equal(got?.status, "failed");
    assert.equal(got?.error, "queue failed");
  });

  test(`${name} worker store writes are visible to the owner`, async () => {
    const { meetings, store } = factory();
    const row = draft("job.mp4");
    await meetings.insert(userA, row);
    const id = row._id.toHexString();
    await store.setStatus(id, "processing");
    assert.equal((await meetings.get(userA, id))?.status, "processing");
    const tasks = [pendingTask("follow up")];
    await store.setReady(id, { text: "summary", takeaways: ["one"] }, tasks);
    const ready = await meetings.get(userA, id);
    assert.equal(ready?.status, "ready");
    assert.equal(ready?.summary?.text, "summary");
    assert.equal(ready?.tasks?.[0]?.text, "follow up");
    await store.setFailed(id, "later failed");
    assert.equal((await meetings.get(userA, id))?.status, "failed");
  });
}

runMeetingsContract("memory", () => createMemoryMeetings());
