import { tool } from "ai";
import type { WithId } from "mongodb";
import { z } from "zod";
import { meetingListQuerySchema, type MeetingListPage } from "../meetings/list-query.ts";
import { transcriptSearchQuerySchema, type TranscriptHit } from "../meetings/search.ts";
import type { Meeting } from "../meetings/store.ts";
import type { AskFredDeps } from "./http.ts";

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
    sourceId: z
      .string()
      .min(1)
      .refine((id) => id !== "/", { message: "sourceId must be a file name" })
      .optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "from must be before to",
  });

export function createAskFredTools(deps: AskFredDeps) {
  return {
    listMeetings: tool({
      description: [
        "List workspace meetings. Meetings have no title; identify them by sourceId, status, createdAt, and summary.",
        "Filter on createdAt range, status (queued | processing | ready | failed), and sourceId.",
        "Use the UTC today range from the system prompt. Do not invent a year.",
        "Only set sourceId when the user named a recording file.",
        "Examples:",
        "- 'What's my day looking like?' → from=start of today, to=start of tomorrow (`to` is exclusive).",
        "- 'what is queued?' → status=queued.",
        "- 'Pending tasks across all meetings' → list ready meetings and read summary.actionItems.",
        "- 'meetings from interview.mp4' → sourceId=interview.mp4.",
      ].join(" "),
      inputSchema: listMeetingsToolSchema,
      execute: async (query) =>
        toAskFredMeetingPage(await deps.listMeetings(meetingListQuerySchema.parse(query))),
    }),
    searchTranscripts: tool({
      description: [
        "Semantic search over transcript chunk embeddings. Not substring match.",
        "Use this when the user asks what was said, whether a topic came up, or wants a quote from a call.",
        "Examples:",
        "- 'did we talk about the launch date?'",
        "- 'find what people said about billing'",
        "- 'quotes about the Q3 deadline'",
      ].join(" "),
      inputSchema: transcriptSearchQuerySchema,
      execute: async (query) => (await deps.searchTranscripts(query)).map(toAskFredTranscriptHit),
    }),
  };
}
