import { ObjectId, type WithId } from "mongodb";
import { z } from "zod";
import type { Actor } from "../../lib/auth/index.ts";
import type { Embed } from "../../lib/embed/index.ts";
import { publicMeeting } from "./public-meeting.ts";
import type { Meeting, Meetings } from "./store.ts";
import type { TranscriptChunkHit, TranscriptsStore } from "./transcripts.ts";

export type TranscriptSearchQuery = {
  query: string;
  limit: number;
  meetingId?: string;
};

export type TranscriptHit = {
  meetingId: string;
  sourceId: string;
  name: string;
  createdAt: Date;
  index: number;
  text: string;
  score: number;
};

export const transcriptSearchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().int().positive().max(20).default(8),
});

export const meetingTranscriptSearchQuerySchema = transcriptSearchQuerySchema.extend({
  meetingId: z.string().min(1).refine(ObjectId.isValid, { message: "invalid meetingId" }),
});

export type SearchTranscriptsDeps = {
  meetings: Meetings;
  transcripts: TranscriptsStore;
  embed: Embed;
};

async function ownedMeetingsForSearch(
  meetings: Meetings,
  actor: Actor,
  meetingId: string | undefined,
): Promise<WithId<Meeting>[]> {
  if (meetingId !== undefined) {
    const meeting = await meetings.get(actor, meetingId);
    if (meeting === null) {
      return [];
    }
    return [meeting];
  }
  const total = await meetings.count(actor, {});
  if (total === 0) {
    return [];
  }
  return meetings.list(actor, 0, total, {});
}

function toHit(meeting: WithId<Meeting>, hit: TranscriptChunkHit): TranscriptHit {
  const view = publicMeeting(meeting);
  return {
    meetingId: view.id,
    sourceId: view.sourceId,
    name: view.name,
    createdAt: meeting.createdAt,
    index: hit.index,
    text: hit.text,
    score: hit.score,
  };
}

export async function searchTranscripts(
  deps: SearchTranscriptsDeps,
  actor: Actor,
  query: TranscriptSearchQuery,
): Promise<TranscriptHit[]> {
  const owned = await ownedMeetingsForSearch(deps.meetings, actor, query.meetingId);
  if (owned.length === 0) {
    return [];
  }
  const [vector] = await deps.embed.run([query.query]);
  if (vector === undefined) {
    return [];
  }
  const meetingIds = owned.map((meeting) => meeting._id.toHexString());
  const byId = new Map(owned.map((meeting) => [meeting._id.toHexString(), meeting]));
  const hits = await deps.transcripts.searchByEmbedding(vector, query.limit, meetingIds);
  const joined: TranscriptHit[] = [];
  for (const hit of hits) {
    const meeting = byId.get(hit.meetingId);
    if (meeting === undefined) {
      continue;
    }
    joined.push(toHit(meeting, hit));
  }
  return joined;
}
