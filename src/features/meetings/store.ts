import { ObjectId, type MongoClient, type WithId } from "mongodb";
import type { MeetingSummary } from "../../lib/summarize/index.ts";

export type MeetingStatus = "queued" | "processing" | "ready" | "failed";

export type MeetingBlob = {
  url: string;
  durationInSeconds: number;
  sizeInBytes: number;
  thumbnailUrl: string;
};

export type Meeting = {
  sourceType: "upload";
  sourceId: string;
  createdAt: Date;
  status: MeetingStatus;
  summary?: MeetingSummary;
  error?: string;
  blob: MeetingBlob;
};

export type MeetingsStore = {
  createId: () => ObjectId;
  insert: (meeting: WithId<Meeting>) => Promise<void>;
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: (skip: number, limit: number) => Promise<WithId<Meeting>[]>;
  count: () => Promise<number>;
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

export function createMeetingsStore(client: MongoClient): MeetingsStore {
  const collection = client.db().collection<Meeting>("meetings");

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
    list: async (skip, limit) =>
      collection.find().sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
    count: async () => collection.countDocuments(),
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
