import { z } from "zod";
import type { Actor } from "../../lib/auth/index.ts";
import type { MeetingQuery, Meetings } from "./store.ts";
import { pageQuerySchema, skipOf, type Page, type PageQuery } from "./page.ts";
import { publicMeeting } from "./public-meeting.ts";
import {
  matchingTasks,
  toPublicMeetingTask,
  type PublicMeetingTask,
  type TaskStatus,
} from "./tasks.ts";

export type ActionListQuery = PageQuery & {
  status?: TaskStatus;
};

export type ActionGroup = {
  meetingId: string;
  sourceId: string;
  name: string;
  createdAt: string;
  href: string;
  mediaKind: "video" | "audio";
  tasks: PublicMeetingTask[];
};

export type ActionListPage = Page<ActionGroup>;

export const actionListQuerySchema: z.ZodType<ActionListQuery> = pageQuerySchema.extend({
  status: z.enum(["pending", "completed"]).optional(),
});

export function actionFilter(query: ActionListQuery): MeetingQuery {
  if (query.status !== undefined) {
    return { taskStatus: query.status };
  }
  return { hasTasks: true };
}

export async function listActions(
  meetings: Meetings,
  actor: Actor,
  query: ActionListQuery,
): Promise<ActionListPage> {
  const filter = actionFilter(query);
  const skip = skipOf(query);
  const [rows, total] = await Promise.all([
    meetings.list(actor, skip, query.limit, filter),
    meetings.count(actor, filter),
  ]);
  return {
    items: rows.map((meeting) => {
      const view = publicMeeting(meeting);
      return {
        meetingId: view.id,
        sourceId: view.sourceId,
        name: view.name,
        createdAt: view.createdAt,
        href: view.href,
        mediaKind: view.mediaKind,
        tasks: matchingTasks(meeting.tasks, query.status).map(toPublicMeetingTask),
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}
