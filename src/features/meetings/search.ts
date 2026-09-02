import { z } from "zod";
import type { Embed } from "../../lib/embed/index.ts";
import type { MeetingsStore } from "./store.ts";
import type { TranscriptsStore } from "./transcripts.ts";

export type TranscriptSearchQuery = {
  query: string;
  limit: number;
};

export type TranscriptHit = {
  meetingId: string;
  sourceId: string;
  createdAt: Date;
  index: number;
  text: string;
  score: number;
};

export const transcriptSearchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().positive().max(20).default(8),
});

export type SearchTranscriptsDeps = {
  meetings: MeetingsStore;
  transcripts: TranscriptsStore;
  embed: Embed;
};

export async function searchTranscripts(
  deps: SearchTranscriptsDeps,
  query: TranscriptSearchQuery,
): Promise<TranscriptHit[]> {
  const [vector] = await deps.embed.run([query.query]);
  if (vector === undefined) {
    return [];
  }
  const hits = await deps.transcripts.searchByEmbedding(vector, query.limit);
  const joined: TranscriptHit[] = [];
  for (const hit of hits) {
    const meeting = await deps.meetings.get(hit.meetingId);
    if (!meeting) {
      continue;
    }
    joined.push({
      meetingId: hit.meetingId,
      sourceId: meeting.sourceId,
      createdAt: meeting.createdAt,
      index: hit.index,
      text: hit.text,
      score: hit.score,
    });
  }
  return joined;
}
