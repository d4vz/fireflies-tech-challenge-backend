import { z } from "zod";
import type { MeetingFilter } from "./list-query.ts";
import type { MeetingsStore } from "./store.ts";
import {
  matchingTasks,
  toPublicMeetingTask,
  type PublicMeetingTask,
  type TaskStatus,
} from "./tasks.ts";

export type ActionListQuery = {
  page: number;
  limit: number;
  status?: TaskStatus;
};

export type ActionGroup = {
  meetingId: string;
  sourceId: string;
  createdAt: string;
  href: string;
  tasks: PublicMeetingTask[];
};

export type ActionListPage = {
  items: ActionGroup[];
  total: number;
  page: number;
  limit: number;
};

export const actionListQuerySchema: z.ZodType<ActionListQuery> = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  status: z.enum(["pending", "completed"]).optional(),
});

export const taskStatusSchema = z.object({
  status: z.enum(["pending", "completed"]),
});

export function actionFilter(query: ActionListQuery): MeetingFilter {
  if (query.status !== undefined) {
    return { taskStatus: query.status };
  }
  return { hasTasks: true };
}

function meetingHref(id: string) {
  return `/meetings/${id}`;
}

export async function listActions(
  store: Pick<MeetingsStore, "list" | "count">,
  query: ActionListQuery,
): Promise<ActionListPage> {
  const filter = actionFilter(query);
  const skip = (query.page - 1) * query.limit;
  const [meetings, total] = await Promise.all([
    store.list(skip, query.limit, filter),
    store.count(filter),
  ]);
  return {
    items: meetings.map((meeting) => {
      const meetingId = meeting._id.toHexString();
      return {
        meetingId,
        sourceId: meeting.sourceId,
        createdAt: meeting.createdAt.toISOString(),
        href: meetingHref(meetingId),
        tasks: matchingTasks(meeting.tasks, query.status).map(toPublicMeetingTask),
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}
