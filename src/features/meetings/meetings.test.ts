import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId, type WithId } from "mongodb";
import { ownerId, type OwnerId } from "../../lib/auth/index.ts";
import type { MeetingFilter } from "./list-query.ts";
import { forActor, type Meeting, type MeetingsStore } from "./store.ts";

function sampleMeeting(sourceId: string, userId: OwnerId): WithId<Meeting> {
  return {
    _id: new ObjectId(),
    userId,
    sourceType: "upload",
    sourceId,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "ready",
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

function fakeMeetingsStore(items: WithId<Meeting>[]): MeetingsStore & {
  listFilters: MeetingFilter[];
  inserted: WithId<Meeting>[];
} {
  const listFilters: MeetingFilter[] = [];
  const inserted: WithId<Meeting>[] = [];
  const rows = [...items];
  return {
    listFilters,
    inserted,
    createId: () => new ObjectId(),
    insert: async (meeting) => {
      inserted.push(meeting);
      rows.push(meeting);
    },
    get: async (id) => rows.find((item) => item._id.toHexString() === id) ?? null,
    list: async (_skip, _limit, filter) => {
      listFilters.push(filter);
      return rows.filter((item) => item.userId === filter.userId);
    },
    count: async (filter) => rows.filter((item) => item.userId === filter.userId).length,
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setTaskStatus: async () => unused(),
    setFailed: async () => unused(),
  };
}

test("forActor get returns null for another user's meeting", async () => {
  const meeting = sampleMeeting("keep.mp4", ownerId("user_a"));
  const owned = forActor(fakeMeetingsStore([meeting]), { id: ownerId("user_b") });
  assert.equal(await owned.get(meeting._id.toHexString()), null);
});

test("forActor list always filters userId", async () => {
  const mine = sampleMeeting("mine.mp4", ownerId("user_a"));
  const theirs = sampleMeeting("theirs.mp4", ownerId("user_b"));
  const store = fakeMeetingsStore([mine, theirs]);
  const owned = forActor(store, { id: ownerId("user_a") });
  const items = await owned.list(0, 10, { status: "ready" });
  assert.deepEqual(store.listFilters, [{ status: "ready", userId: ownerId("user_a") }]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.sourceId, "mine.mp4");
});

test("forActor insert stamps actor.id", async () => {
  const store = fakeMeetingsStore([]);
  const owned = forActor(store, { id: ownerId("user_a") });
  const _id = new ObjectId();
  await owned.insert({
    _id,
    sourceType: "upload",
    sourceId: "clip.mp4",
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    status: "queued",
    blob: {
      url: "/v",
      durationInSeconds: 1,
      sizeInBytes: 1,
      thumbnailUrl: "/t",
    },
  });
  assert.equal(store.inserted[0]?.userId, ownerId("user_a"));
  assert.equal((await owned.get(_id.toHexString())) !== null, true);
});
