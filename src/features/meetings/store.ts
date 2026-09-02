import { ObjectId, type Filter, type MongoClient, type WithId } from "mongodb";
import { z } from "zod";
import type { MeetingSummary } from "../../lib/summarize/index.ts";
import type { MeetingFilter } from "./list-query.ts";

export type MeetingStatus = "queued" | "processing" | "ready" | "failed";

export type MeetingMediaKind = "video" | "audio";

export type VideoMeetingBlob = {
  kind: "video";
  url: string;
  durationInSeconds: number;
  sizeInBytes: number;
  thumbnailUrl: string;
};

export type AudioMeetingBlob = {
  kind: "audio";
  url: string;
  durationInSeconds: number;
  sizeInBytes: number;
};

export type MeetingBlob = VideoMeetingBlob | AudioMeetingBlob;

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
  list: (skip: number, limit: number, filter: MeetingFilter) => Promise<WithId<Meeting>[]>;
  count: (filter: MeetingFilter) => Promise<number>;
  setStatus: (id: string, status: MeetingStatus) => Promise<void>;
  setReady: (id: string, summary: MeetingSummary) => Promise<void>;
  setFailed: (id: string, error: string) => Promise<void>;
};

const audioMeetingBlobSchema = z.object({
  kind: z.literal("audio"),
  url: z.string(),
  durationInSeconds: z.number(),
  sizeInBytes: z.number(),
});

const videoMeetingBlobSchema = z.object({
  kind: z.literal("video").optional(),
  url: z.string(),
  durationInSeconds: z.number(),
  sizeInBytes: z.number(),
  thumbnailUrl: z.string(),
});

const meetingBlobSchema = z.union([audioMeetingBlobSchema, videoMeetingBlobSchema]);

// Mongo documents are untyped until this parse.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function parseMeetingBlob(raw: unknown): MeetingBlob {
  const parsed = meetingBlobSchema.parse(raw);
  if (parsed.kind === "audio") {
    return {
      kind: "audio",
      url: parsed.url,
      durationInSeconds: parsed.durationInSeconds,
      sizeInBytes: parsed.sizeInBytes,
    };
  }
  return {
    kind: "video",
    url: parsed.url,
    durationInSeconds: parsed.durationInSeconds,
    sizeInBytes: parsed.sizeInBytes,
    thumbnailUrl: parsed.thumbnailUrl,
  };
}

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
      const doc = await collection.findOne({ _id });
      if (!doc) {
        return null;
      }
      return { ...doc, blob: parseMeetingBlob(doc.blob) };
    },
    list: async (skip, limit, filter) => {
      const docs = await collection
        .find(mongoFilter(filter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return docs.map((doc) => ({ ...doc, blob: parseMeetingBlob(doc.blob) }));
    },
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
