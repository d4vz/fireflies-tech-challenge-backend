import { MongoServerError, ObjectId, type Db, type MongoClient } from "mongodb";

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

export type TranscriptChunkHit = {
  meetingId: string;
  index: number;
  text: string;
  score: number;
};

export type TranscriptsStore = {
  insertAll: (meetingId: string, chunks: NewTranscriptChunk[]) => Promise<void>;
  listByMeeting: (meetingId: string) => Promise<PublicTranscriptChunk[]>;
  searchByEmbedding: (
    embedding: number[],
    limit: number,
    meetingId?: string,
  ) => Promise<TranscriptChunkHit[]>;
  ensureVectorIndex: () => Promise<void>;
};

const VECTOR_INDEX_NAME = "transcript_embedding";
const VECTOR_DIMENSIONS = 1536;

const VECTOR_INDEX_FIELDS = [
  {
    type: "vector",
    path: "embedding",
    numDimensions: VECTOR_DIMENSIONS,
    similarity: "cosine",
  },
  { type: "filter", path: "meetingId" },
] as const;

type ListedVectorIndexField = {
  type?: string;
  path?: string;
};

type ListedVectorIndexDefinition = {
  fields?: ListedVectorIndexField[];
};

type ListedSearchIndex = {
  name: string;
  latestDefinition?: ListedVectorIndexDefinition;
  definition?: ListedVectorIndexDefinition;
};

function vectorIndexHasMeetingIdFilter(index: ListedSearchIndex): boolean {
  const fields = index.latestDefinition?.fields ?? index.definition?.fields ?? [];
  return fields.some((field) => field.type === "filter" && field.path === "meetingId");
}

type VectorHit = {
  meetingId: ObjectId;
  index: number;
  text: string;
  score: number;
};

type VectorSearchStage = {
  index: string;
  path: string;
  queryVector: number[];
  numCandidates: number;
  limit: number;
  filter?: { meetingId: ObjectId };
};

function isIndexExistsError(error: unknown): error is Error {
  if (error instanceof MongoServerError && (error.code === 68 || error.code === 48)) {
    return true;
  }
  return error instanceof Error && /already exists/i.test(error.message);
}

async function ensureCollection(db: Db, name: string): Promise<void> {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  if (found.length > 0) {
    return;
  }
  try {
    await db.createCollection(name);
  } catch (error) {
    if (isIndexExistsError(error)) {
      return;
    }
    throw error;
  }
}

function toChunkHit(row: VectorHit): TranscriptChunkHit {
  return {
    meetingId: row.meetingId.toHexString(),
    index: row.index,
    text: row.text,
    score: row.score,
  };
}

export function createTranscriptsStore(client: MongoClient): TranscriptsStore {
  const db = client.db();
  const collection = db.collection<TranscriptChunk>("transcripts");

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
    searchByEmbedding: async (embedding, limit, meetingId) => {
      if (meetingId !== undefined && !ObjectId.isValid(meetingId)) {
        return [];
      }
      const stage: VectorSearchStage = {
        index: VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector: embedding,
        numCandidates: Math.max(limit * 10, 10),
        limit,
      };
      if (meetingId !== undefined) {
        stage.filter = { meetingId: new ObjectId(meetingId) };
      }
      const rows = await collection
        .aggregate<VectorHit>([
          { $vectorSearch: stage },
          {
            $project: {
              meetingId: 1,
              index: 1,
              text: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ])
        .toArray();
      return rows.map(toChunkHit);
    },
    ensureVectorIndex: async () => {
      await ensureCollection(db, collection.collectionName);
      const existing = await collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
      const listed = existing[0];
      if (listed === undefined) {
        try {
          await collection.createSearchIndex({
            name: VECTOR_INDEX_NAME,
            type: "vectorSearch",
            definition: { fields: VECTOR_INDEX_FIELDS },
          });
        } catch (error) {
          if (isIndexExistsError(error)) {
            return;
          }
          throw error;
        }
        return;
      }
      // Atlas $listSearchIndexes returns latestDefinition; createSearchIndex takes definition.
      // SAFETY: the driver types the listing as { name: string } only.
      if (vectorIndexHasMeetingIdFilter(listed as ListedSearchIndex)) {
        return;
      }
      await collection.updateSearchIndex(VECTOR_INDEX_NAME, { fields: VECTOR_INDEX_FIELDS });
    },
  };
}
