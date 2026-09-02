import { tool, type LanguageModel } from "ai";
import type { WithId } from "mongodb";
import { z } from "zod";
import {
  actionListQuerySchema,
  type ActionListPage,
  type ActionListQuery,
} from "../meetings/actions-query.ts";
import {
  meetingListQuerySchema,
  type MeetingListPage,
  type MeetingListQuery,
} from "../meetings/list-query.ts";
import {
  meetingTranscriptSearchQuerySchema,
  transcriptSearchQuerySchema,
  type MeetingTranscriptSearchQuery,
  type TranscriptHit,
  type TranscriptSearchQuery,
} from "../meetings/search.ts";
import type { Meeting } from "../meetings/store.ts";

export type AskFredDeps = {
  model: LanguageModel;
  listMeetings: (query: MeetingListQuery) => Promise<MeetingListPage>;
  listActions: (query: ActionListQuery) => Promise<ActionListPage>;
  searchTranscripts: (query: TranscriptSearchQuery) => Promise<TranscriptHit[]>;
  searchMeetingTranscripts: (query: MeetingTranscriptSearchQuery) => Promise<TranscriptHit[]>;
};

function meetingHref(id: string) {
  return `/meetings/${id}`;
}

type AskFredMeeting = {
  id: string;
  sourceId: string;
  createdAt: string;
  status: Meeting["status"];
  href: string;
  summary?: Meeting["summary"];
  error?: string;
};

function toAskFredMeeting(meeting: WithId<Meeting>): AskFredMeeting {
  const id = meeting._id.toHexString();
  const card: AskFredMeeting = {
    id,
    sourceId: meeting.sourceId,
    createdAt: meeting.createdAt.toISOString(),
    status: meeting.status,
    href: meetingHref(id),
  };
  if (meeting.summary !== undefined) {
    card.summary = meeting.summary;
  }
  if (meeting.error !== undefined) {
    card.error = meeting.error;
  }
  return card;
}

function toAskFredMeetingPage(page: MeetingListPage) {
  return {
    items: page.items.map(toAskFredMeeting),
    total: page.total,
    page: page.page,
    limit: page.limit,
  };
}

function toAskFredTranscriptHit(hit: TranscriptHit) {
  return {
    meetingId: hit.meetingId,
    sourceId: hit.sourceId,
    createdAt: hit.createdAt.toISOString(),
    index: hit.index,
    text: hit.text,
    score: hit.score,
    href: meetingHref(hit.meetingId),
  };
}

export const listMeetingsToolSchema = z
  .object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(50).default(10),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    status: z.enum(["queued", "processing", "ready", "failed"]).optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "from must be before to",
  });

export const listActionsToolSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(10),
  status: z.enum(["pending", "completed"]).optional(),
});

export function createAskFredTools(deps: AskFredDeps) {
  return {
    listMeetings: tool({
      description: [
        "List workspace meetings. Meetings have no title; identify them by sourceId, status, createdAt, and summary.",
        "Filter on createdAt range and status (queued | processing | ready | failed).",
        "Use the UTC today range from the system prompt. Do not invent a year.",
        "Examples:",
        "- 'What's my day looking like?' → from=start of today, to=start of tomorrow (`to` is exclusive).",
        "- 'what is queued?' → status=queued.",
      ].join(" "),
      inputSchema: listMeetingsToolSchema,
      execute: async (query) =>
        toAskFredMeetingPage(
          await deps.listMeetings(
            meetingListQuerySchema.parse(listMeetingsToolSchema.parse(query)),
          ),
        ),
    }),
    listActions: tool({
      description: [
        "List action items grouped by meeting. Meetings have no title; identify them by sourceId.",
        "Filter on status (pending | completed). Omit status for all tasks.",
        "Each row is one meeting with the matching tasks. Tasks have id, text, status, and updatedAt.",
        "Examples:",
        "- 'Pending tasks across all meetings' → status=pending.",
        "- 'what did I complete?' → status=completed.",
      ].join(" "),
      inputSchema: listActionsToolSchema,
      execute: async (query) =>
        deps.listActions(actionListQuerySchema.parse(listActionsToolSchema.parse(query))),
    }),
    searchTranscripts: tool({
      description: [
        "Semantic search over transcript chunks across the meeting library. Not substring match.",
        "Use this when the user asks what was said and did not name a meeting.",
        "Do not use this when they mean one call, this meeting, a sourceId they named, or an id you already have.",
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
        "If you only have a sourceId, call listMeetings first and use that meeting's id.",
        "Examples:",
        "- 'on this call, did we talk about the launch date?'",
        "- 'in interview.mp4, quotes about billing'",
        "- follow-up on a meeting you just listed",
      ].join(" "),
      inputSchema: meetingTranscriptSearchQuerySchema,
      execute: async (query) =>
        (await deps.searchMeetingTranscripts(query)).map(toAskFredTranscriptHit),
    }),
  };
}
