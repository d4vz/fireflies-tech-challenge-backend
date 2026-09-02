import { ObjectId, type MongoClient } from "mongodb";
import type { Meeting } from "./meeting.ts";

export type MeetingsStore = {
  createId: () => string;
  insert: (meeting: Meeting) => Promise<void>;
};

export function createMeetingsStore(client: MongoClient): MeetingsStore {
  return {
    createId: () => new ObjectId().toHexString(),
    insert: async (meeting) => {
      await client
        .db()
        .collection("meetings")
        .insertOne({
          ...meeting,
          _id: new ObjectId(meeting._id),
        });
    },
  };
}
