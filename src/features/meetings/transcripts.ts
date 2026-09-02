import { ObjectId, type MongoClient } from "mongodb";

export type TranscriptChunk = {
  meetingId: ObjectId;
  index: number;
  text: string;
  embedding: number[];
  model: string;
};

export type PublicTranscriptChunk = {
  index: number;
  text: string;
};

export type NewTranscriptChunk = {
  index: number;
  text: string;
  embedding: number[];
  model: string;
};

export type TranscriptsStore = {
  insertAll: (meetingId: string, chunks: NewTranscriptChunk[]) => Promise<void>;
  listByMeeting: (meetingId: string) => Promise<PublicTranscriptChunk[]>;
};

export function createTranscriptsStore(client: MongoClient): TranscriptsStore {
  const collection = client.db().collection<TranscriptChunk>("transcripts");

  return {
    insertAll: async (meetingId, chunks) => {
      if (chunks.length === 0 || !ObjectId.isValid(meetingId)) {
        return;
      }
      const id = new ObjectId(meetingId);
      await collection.insertMany(
        chunks.map((chunk) => ({
          meetingId: id,
          index: chunk.index,
          text: chunk.text,
          embedding: chunk.embedding,
          model: chunk.model,
        })),
      );
    },
    listByMeeting: async (meetingId) => {
      if (!ObjectId.isValid(meetingId)) {
        return [];
      }
      return collection
        .find({ meetingId: new ObjectId(meetingId) })
        .project<PublicTranscriptChunk>({ index: 1, text: 1, _id: 0 })
        .sort({ index: 1 })
        .toArray();
    },
  };
}
