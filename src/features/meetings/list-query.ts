import { z } from "zod";
import type { Meeting, MeetingStatus, MeetingsStore } from "./store.ts";
import type { WithId } from "mongodb";

export type MeetingListQuery = {
  page: number;
  limit: number;
  from?: Date;
  to?: Date;
  status?: MeetingStatus;
  sourceId?: string;
};

export type MeetingFilter = {
  from?: Date;
  to?: Date;
  status?: MeetingStatus;
  sourceId?: string;
};

export type MeetingListPage = {
  items: WithId<Meeting>[];
  total: number;
  page: number;
  limit: number;
};

export const meetingListQuerySchema: z.ZodType<MeetingListQuery> = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(10),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    status: z.enum(["queued", "processing", "ready", "failed"]).optional(),
    sourceId: z.string().min(1).optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from < query.to, {
    message: "from must be before to",
  });

export function meetingFilter(query: MeetingListQuery): MeetingFilter {
  const filter: MeetingFilter = {};
  if (query.from !== undefined) {
    filter.from = query.from;
  }
  if (query.to !== undefined) {
    filter.to = query.to;
  }
  if (query.status !== undefined) {
    filter.status = query.status;
  }
  if (query.sourceId !== undefined) {
    filter.sourceId = query.sourceId;
  }
  return filter;
}

export function skipOf(query: MeetingListQuery): number {
  return (query.page - 1) * query.limit;
}

export async function listMeetings(
  store: MeetingsStore,
  query: MeetingListQuery,
): Promise<MeetingListPage> {
  const filter = meetingFilter(query);
  const skip = skipOf(query);
  const [items, total] = await Promise.all([
    store.list(skip, query.limit, filter),
    store.count(filter),
  ]);
  return { items, total, page: query.page, limit: query.limit };
}
