import { z } from "zod";
import type { Actor } from "../../lib/auth/index.ts";
import { fromBeforeTo, pageQuerySchema, skipOf, type Page, type PageQuery } from "./page.ts";
import { withPublicCard } from "./public-meeting.ts";
import type { Meeting, MeetingQuery, MeetingStatus, Meetings } from "./store.ts";
import type { WithId } from "mongodb";

export type MeetingListQuery = PageQuery & {
  from?: Date;
  to?: Date;
  status?: MeetingStatus;
  sourceId?: string;
};

export type MeetingFilter = MeetingQuery;

export type MeetingListPage = Page<WithId<Meeting>>;

export const meetingListQuerySchema: z.ZodType<MeetingListQuery> = pageQuerySchema
  .extend({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    status: z.enum(["queued", "processing", "ready", "failed"]).optional(),
    sourceId: z.string().min(1).optional(),
  })
  .refine(fromBeforeTo, { message: "from must be before to" });

export function meetingFilter(query: MeetingListQuery): MeetingQuery {
  const filter: MeetingQuery = {};
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

export { skipOf };

export async function listMeetings(
  meetings: Meetings,
  actor: Actor,
  query: MeetingListQuery,
): Promise<MeetingListPage> {
  const filter = meetingFilter(query);
  const skip = skipOf(query);
  const [items, total] = await Promise.all([
    meetings.list(actor, skip, query.limit, filter),
    meetings.count(actor, filter),
  ]);
  return {
    items: items.map(withPublicCard),
    total,
    page: query.page,
    limit: query.limit,
  };
}
