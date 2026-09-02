import { ObjectId, type MongoClient, type WithId } from "mongodb";
import type { MeetingSummary } from "../../lib/summarize/index.ts";

export type MeetingTranscript = {
  text: string;
  chunkSize: number;
  chunkCount: number;
  charLength: number;
};

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
  transcript: MeetingTranscript;
  summary: MeetingSummary;
  blob: MeetingBlob;
};

export type MeetingsStore = {
  createId: () => ObjectId;
  insert: (meeting: WithId<Meeting>) => Promise<void>;
  get: (id: string) => Promise<WithId<Meeting> | null>;
  list: () => Promise<WithId<Meeting>[]>;
};

export function meetingVideoKey(meetingId: string): string {
  return `meetings/${meetingId}/video`;
}

export function meetingThumbnailKey(meetingId: string): string {
  return `meetings/${meetingId}/thumbnail.jpg`;
}

export function transcriptStats(text: string, chunkSize: number) {
  const charLength = text.length;
  const chunkCount = charLength === 0 ? 0 : Math.ceil(charLength / chunkSize);
  return {
    text,
    chunkSize,
    chunkCount,
    charLength,
  };
}

export function createMeetingsStore(client: MongoClient): MeetingsStore {
  const collection = client.db().collection<Meeting>("meetings");

  return {
    createId: () => new ObjectId(),
    insert: async (meeting) => {
      await collection.insertOne(meeting);
    },
    get: async (id) => {
      if (!ObjectId.isValid(id)) {
        return null;
      }
      return collection.findOne({ _id: new ObjectId(id) });
    },
    list: async () => collection.find().sort({ createdAt: -1 }).toArray(),
  };
}
