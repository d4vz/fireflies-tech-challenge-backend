import { ObjectId, type Filter, type MongoClient, type WithId } from "mongodb";
import { z } from "zod";
import type { Actor, OwnerId } from "../../lib/auth/index.ts";
import type { MeetingFilter } from "./list-query.ts";
import type { MeetingTask, TaskStatus } from "./tasks.ts";

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

export type StoredMeetingSummary = {
  text: string;
  takeaways: string[];
};

export type Meeting = {
  userId: OwnerId;
  sourceType: "upload";
  sourceId: string;
  name?: string;
  createdAt: Date;
  status: MeetingStatus;
  summary?: StoredMeetingSummary;
  tasks?: MeetingTask[];
  error?: string;
  blob: MeetingBlob;
};

export type SetTaskStatusResult =
  | { kind: "missing" }
  | { kind: "unchanged"; task: MeetingTask }
  | { kind: "updated"; task: MeetingTask };

export type OwnedMeetings = {
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: (skip: number, limit: number, filter: MeetingFilter) => Promise<WithId<Meeting>[]>;
  count: (filter: MeetingFilter) => Promise<number>;
  insert: (draft: Omit<Meeting, "userId"> & { _id: ObjectId }) => Promise<void>;
  setTaskStatus: (
    id: string,
    taskId: string,
    status: TaskStatus,
    at: Date,
  ) => Promise<SetTaskStatusResult>;
};

export type MeetingsStore = {
  createId: () => ObjectId;
  insert: (meeting: WithId<Meeting>) => Promise<void>;
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: (skip: number, limit: number, filter: MeetingFilter) => Promise<WithId<Meeting>[]>;
  count: (filter: MeetingFilter) => Promise<number>;
  setStatus: (id: string, status: MeetingStatus) => Promise<void>;
  setReady: (id: string, summary: StoredMeetingSummary, tasks: MeetingTask[]) => Promise<void>;
  setTaskStatus: (
    id: string,
    taskId: string,
    status: TaskStatus,
    at: Date,
  ) => Promise<SetTaskStatusResult>;
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
  if (filter.userId !== undefined) {
    query.userId = filter.userId;
  }
  if (filter.taskStatus !== undefined) {
    query.tasks = { $elemMatch: { status: filter.taskStatus } };
  } else if (filter.hasTasks === true) {
    query.tasks = { $elemMatch: {} };
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
    setReady: async (id, summary, tasks) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne(
        { _id },
        { $set: { status: "ready", summary, tasks }, $unset: { error: "" } },
      );
    },
    setTaskStatus: async (id, taskId, status, at) => {
      const _id = asObjectId(id);
      const taskObjectId = asObjectId(taskId);
      if (!_id || !taskObjectId) {
        return { kind: "missing" };
      }
      const doc = await collection.findOne({ _id });
      if (!doc) {
        return { kind: "missing" };
      }
      const task = (doc.tasks ?? []).find((item) => item._id.equals(taskObjectId));
      if (task === undefined) {
        return { kind: "missing" };
      }
      if (task.status === status) {
        return { kind: "unchanged", task };
      }
      await collection.updateOne(
        { _id, "tasks._id": taskObjectId },
        { $set: { "tasks.$.status": status, "tasks.$.updatedAt": at } },
      );
      return { kind: "updated", task: { ...task, status, updatedAt: at } };
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
    setTaskStatus: async (id, taskId, status, at) => {
      const meeting = await store.get(id);
      if (meeting === null || meeting.userId !== actor.id) {
        return { kind: "missing" };
      }
      return store.setTaskStatus(id, taskId, status, at);
    },
  };
}
