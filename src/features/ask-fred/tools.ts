import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import type { ActionListPage, ActionListQuery } from "../meetings/actions-query.ts";
import type { MeetingListPage, MeetingListQuery } from "../meetings/list-query.ts";
import { fromBeforeTo, pageToolSchema } from "../meetings/page.ts";
import { meetingHref, publicMeeting } from "../meetings/public-meeting.ts";
import {
  meetingTranscriptSearchQuerySchema,
  transcriptSearchQuerySchema,
  type TranscriptHit,
  type TranscriptSearchQuery,
} from "../meetings/search.ts";

export type AskFredDeps = {
  model: LanguageModel;
  listMeetings: (query: MeetingListQuery) => Promise<MeetingListPage>;
  listActions: (query: ActionListQuery) => Promise<ActionListPage>;
  searchTranscripts: (query: TranscriptSearchQuery) => Promise<TranscriptHit[]>;
};

export const listMeetingsToolSchema = pageToolSchema
  .extend({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    status: z.enum(["queued", "processing", "ready", "failed"]).optional(),
  })
  .refine(fromBeforeTo, { message: "from must be before to" });

export const listActionsToolSchema = pageToolSchema.extend({
  status: z.enum(["pending", "completed"]).optional(),
});

function meetingListQueryFromTool(input: z.infer<typeof listMeetingsToolSchema>): MeetingListQuery {
  const query: MeetingListQuery = { page: input.page, limit: input.limit };
  if (input.from !== undefined) {
    query.from = new Date(input.from);
  }
  if (input.to !== undefined) {
    query.to = new Date(input.to);
  }
  if (input.status !== undefined) {
    query.status = input.status;
  }
  return query;
}

function toAskFredMeetingPage(page: MeetingListPage) {
  return {
    items: page.items.map(publicMeeting),
    total: page.total,
    page: page.page,
    limit: page.limit,
  };
}

function toAskFredTranscriptHit(hit: TranscriptHit) {
  return {
    meetingId: hit.meetingId,
    sourceId: hit.sourceId,
    name: hit.name,
    createdAt: hit.createdAt.toISOString(),
    index: hit.index,
    text: hit.text,
    score: hit.score,
    href: meetingHref(hit.meetingId),
  };
}

export function createAskFredTools(deps: AskFredDeps) {
  return {
    listMeetings: tool({
      description: [
        "List workspace meetings. Identify them by name, sourceId, status, createdAt, and summary.",
        "Filter on createdAt range and status (queued | processing | ready | failed).",
        "Use the UTC today range from the system prompt. Do not invent a year.",
        "Examples:",
        "- 'What's my day looking like?' → from=start of today, to=start of tomorrow (`to` is exclusive).",
        "- 'what is queued?' → status=queued.",
      ].join(" "),
      inputSchema: listMeetingsToolSchema,
      execute: async (query) =>
        toAskFredMeetingPage(await deps.listMeetings(meetingListQueryFromTool(query))),
    }),
    listActions: tool({
      description: [
        "List action items grouped by meeting. Identify them by name.",
        "Filter on status (pending | completed). Omit status for all tasks.",
        "Each row is one meeting with the matching tasks. Tasks have id, text, status, and updatedAt.",
        "Examples:",
        "- 'Pending tasks across all meetings' → status=pending.",
        "- 'what did I complete?' → status=completed.",
      ].join(" "),
      inputSchema: listActionsToolSchema,
      execute: async (query) => deps.listActions(query),
    }),
    searchTranscripts: tool({
      description: [
        "Semantic search over transcript chunks across the meeting library. Not substring match.",
        "Use this when the user asks what was said and did not name a meeting.",
        "Do not use this when they mean one call, this meeting, a name they used, a sourceId they named, or an id you already have.",
        "Examples:",
        "- 'did we talk about the launch date?' with no meeting named",
        "- 'find what people said about billing' across calls",
      ].join(" "),
      inputSchema: transcriptSearchQuerySchema,
      execute: async (query) => (await deps.searchTranscripts(query)).map(toAskFredTranscriptHit),
    }),
    searchMeetingTranscripts: tool({
      description: [
        "Semantic search over transcript chunks in one meeting. Not substring match.",
        "meetingId is required. The app does not send a current meeting.",
        "Get meetingId from listMeetings, from a prior search hit, or from the user.",
        "If you only have a name or sourceId, call listMeetings first and use that meeting's id.",
        "Examples:",
        "- 'on this call, did we talk about the launch date?'",
        "- 'in interview.mp4, quotes about billing'",
        "- follow-up on a meeting you just listed",
      ].join(" "),
      inputSchema: meetingTranscriptSearchQuerySchema,
      execute: async (query) => (await deps.searchTranscripts(query)).map(toAskFredTranscriptHit),
    }),
  };
}
