import { ObjectId, type Filter, type MongoClient, type WithId } from "mongodb";
import type { Actor, OwnerId } from "../../lib/auth/index.ts";
import type { MeetingSummary } from "../../lib/summarize/index.ts";
import type { MeetingFilter } from "./list-query.ts";

export type MeetingStatus = "queued" | "processing" | "ready" | "failed";

export type MeetingBlob = {
  url: string;
  durationInSeconds: number;
  sizeInBytes: number;
  thumbnailUrl: string;
};

export type Meeting = {
  userId: OwnerId;
  sourceType: "upload";
  sourceId: string;
  createdAt: Date;
  status: MeetingStatus;
  summary?: MeetingSummary;
  error?: string;
  blob: MeetingBlob;
};

export type OwnedMeetings = {
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: (skip: number, limit: number, filter: MeetingFilter) => Promise<WithId<Meeting>[]>;
  count: (filter: MeetingFilter) => Promise<number>;
  insert: (draft: Omit<Meeting, "userId"> & { _id: ObjectId }) => Promise<void>;
};

export type MeetingsStore = {
  createId: () => ObjectId;
  insert: (meeting: WithId<Meeting>) => Promise<void>;
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: (skip: number, limit: number, filter: MeetingFilter) => Promise<WithId<Meeting>[]>;
  count: (filter: MeetingFilter) => Promise<number>;
  setStatus: (id: string, status: MeetingStatus) => Promise<void>;
  setReady: (id: string, summary: MeetingSummary) => Promise<void>;
  setFailed: (id: string, error: string) => Promise<void>;
};

export function meetingVideoKey(meetingId: string): string {
  return `meetings/${meetingId}/video`;
}

export function meetingThumbnailKey(meetingId: string): string {
  return `meetings/${meetingId}/thumbnail.jpg`;
}

function asObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

type CreatedAtBounds = {
  $gte?: Date;
  $lt?: Date;
};

function mongoFilter(filter: MeetingFilter): Filter<Meeting> {
  const query: Filter<Meeting> = {};
  if (filter.status !== undefined) {
    query.status = filter.status;
  }
  if (filter.sourceId !== undefined) {
    query.sourceId = filter.sourceId;
  }
  if (filter.userId !== undefined) {
    query.userId = filter.userId;
  }
  if (filter.from === undefined && filter.to === undefined) {
    return query;
  }
  const createdAt: CreatedAtBounds = {};
  if (filter.from !== undefined) {
    createdAt.$gte = filter.from;
  }
  if (filter.to !== undefined) {
    // Exclusive `to` so a day query is [startOfDay, startOfNextDay).
    createdAt.$lt = filter.to;
  }
  query.createdAt = createdAt;
  return query;
}

export function createMeetingsStore(client: MongoClient): MeetingsStore {
  const collection = client.db().collection<Meeting>("meetings");
  void collection.createIndex({ userId: 1, createdAt: -1 });

  return {
    createId: () => new ObjectId(),
    insert: async (meeting) => {
      await collection.insertOne(meeting);
    },
    get: async (id) => {
      const _id = asObjectId(id);
      if (!_id) {
        return null;
      }
      return collection.findOne({ _id });
    },
    list: async (skip, limit, filter) =>
      collection
        .find(mongoFilter(filter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
    count: async (filter) => collection.countDocuments(mongoFilter(filter)),
    setStatus: async (id, status) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne({ _id }, { $set: { status }, $unset: { error: "" } });
    },
    setReady: async (id, summary) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne(
        { _id },
        { $set: { status: "ready", summary }, $unset: { error: "" } },
      );
    },
    setFailed: async (id, error) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne({ _id }, { $set: { status: "failed", error } });
    },
  };
}

export function forActor(store: MeetingsStore, actor: Actor): OwnedMeetings {
  return {
    get: async (id) => {
      const meeting = await store.get(id);
      if (meeting === null || meeting.userId !== actor.id) {
        return null;
      }
      return meeting;
    },
    list: (skip, limit, filter) => store.list(skip, limit, { ...filter, userId: actor.id }),
    count: (filter) => store.count({ ...filter, userId: actor.id }),
    insert: (draft) => store.insert({ ...draft, userId: actor.id }),
  };
}
