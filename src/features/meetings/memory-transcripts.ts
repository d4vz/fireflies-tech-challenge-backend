import { ObjectId } from "mongodb";
import type {
  NewTranscriptChunk,
  PublicTranscriptChunk,
  TranscriptChunkHit,
  TranscriptsStore,
} from "./transcripts.ts";

type StoredChunk = {
  meetingId: string;
  index: number;
  text: string;
  embedding: number[];
};

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denom === 0) {
    return 0;
  }
  return dot / denom;
}

function inScope(chunk: StoredChunk, meetingIds: string[] | undefined): boolean {
  if (meetingIds === undefined) {
    return true;
  }
  return meetingIds.includes(chunk.meetingId);
}

export function createMemoryTranscripts(): TranscriptsStore {
  const rows: StoredChunk[] = [];

  return {
    insertAll: async (meetingId, chunks: NewTranscriptChunk[]) => {
      if (chunks.length === 0 || !ObjectId.isValid(meetingId)) {
        return;
      }
      for (const chunk of chunks) {
        rows.push({
          meetingId,
          index: chunk.index,
          text: chunk.text,
          embedding: chunk.embedding,
        });
      }
    },
    listByMeeting: async (meetingId): Promise<PublicTranscriptChunk[]> => {
      return rows
        .filter((chunk) => chunk.meetingId === meetingId)
        .sort((left, right) => left.index - right.index)
        .map((chunk) => ({ index: chunk.index, text: chunk.text }));
    },
    searchByEmbedding: async (embedding, limit, meetingIds): Promise<TranscriptChunkHit[]> => {
      if (meetingIds !== undefined && meetingIds.length === 0) {
        return [];
      }
      return rows
        .filter((chunk) => inScope(chunk, meetingIds))
        .map((chunk) => ({
          meetingId: chunk.meetingId,
          index: chunk.index,
          text: chunk.text,
          score: cosine(embedding, chunk.embedding),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    },
    ensureVectorIndex: async () => undefined,
  };
}
