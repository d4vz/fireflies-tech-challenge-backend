import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import type { Actor, OwnerId } from "../../lib/auth/index.ts";
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

export type MeetingDraft = Omit<Meeting, "userId"> & { _id: ObjectId };

export type MeetingQuery = {
  from?: Date;
  to?: Date;
  status?: MeetingStatus;
  sourceId?: string;
  taskStatus?: TaskStatus;
  hasTasks?: boolean;
};

export type MeetingFilter = MeetingQuery & {
  userId: OwnerId;
};

export type SetTaskStatusResult =
  | { kind: "missing" }
  | { kind: "unchanged"; task: MeetingTask }
  | { kind: "updated"; task: MeetingTask };

export type Meetings = {
  createId: () => ObjectId;
  get: (actor: Actor, id: string) => Promise<WithId<Meeting> | null>;
  list: (
    actor: Actor,
    skip: number,
    limit: number,
    query: MeetingQuery,
  ) => Promise<WithId<Meeting>[]>;
  count: (actor: Actor, query: MeetingQuery) => Promise<number>;
  insert: (actor: Actor, draft: MeetingDraft) => Promise<void>;
  setTaskStatus: (
    actor: Actor,
    id: string,
    taskId: string,
    status: TaskStatus,
    at: Date,
  ) => Promise<SetTaskStatusResult>;
  setFailed: (actor: Actor, id: string, error: string) => Promise<void>;
};

/**
 * Privileged Store for the processing worker. The worker is not an Actor; it
 * already holds a meetingId from the queue. HTTP reads and writes go through
 * Meetings, which takes an Actor on every call. Do not pass MeetingsStore into
 * createApp.
 */
export type MeetingsStore = {
  createId: () => ObjectId;
  setStatus: (id: string, status: MeetingStatus) => Promise<void>;
  setReady: (id: string, summary: StoredMeetingSummary, tasks: MeetingTask[]) => Promise<void>;
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

export function asObjectId(id: string) {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  return new ObjectId(id);
}

export function scopedFilter(actor: Actor, query: MeetingQuery): MeetingFilter {
  return { ...query, userId: actor.id };
}
