import { ObjectId, type WithId } from "mongodb";
import type { Actor } from "../../lib/auth/index.ts";
import {
  asObjectId,
  scopedFilter,
  type Meeting,
  type MeetingFilter,
  type Meetings,
  type MeetingsStore,
  type MeetingStatus,
  type SetTaskStatusResult,
  type StoredMeetingSummary,
} from "./store.ts";
import type { MeetingTask, TaskStatus } from "./tasks.ts";

export type MemoryMeetings = {
  meetings: Meetings;
  store: MeetingsStore;
};

function matchesCreatedAt(meeting: WithId<Meeting>, filter: MeetingFilter): boolean {
  if (filter.from !== undefined && meeting.createdAt < filter.from) {
    return false;
  }
  if (filter.to !== undefined && meeting.createdAt >= filter.to) {
    return false;
  }
  return true;
}

function matchesTasks(meeting: WithId<Meeting>, filter: MeetingFilter): boolean {
  if (filter.taskStatus !== undefined) {
    return (meeting.tasks ?? []).some((item) => item.status === filter.taskStatus);
  }
  if (filter.hasTasks === true) {
    return (meeting.tasks ?? []).length > 0;
  }
  return true;
}

function matchesFilter(meeting: WithId<Meeting>, filter: MeetingFilter): boolean {
  if (meeting.userId !== filter.userId) {
    return false;
  }
  if (filter.status !== undefined && meeting.status !== filter.status) {
    return false;
  }
  if (filter.sourceId !== undefined && meeting.sourceId !== filter.sourceId) {
    return false;
  }
  return matchesCreatedAt(meeting, filter) && matchesTasks(meeting, filter);
}

function byNewest(left: WithId<Meeting>, right: WithId<Meeting>): number {
  return right.createdAt.getTime() - left.createdAt.getTime();
}

function rowById(rows: WithId<Meeting>[], id: string): WithId<Meeting> | undefined {
  const _id = asObjectId(id);
  if (!_id) {
    return undefined;
  }
  return rows.find((item) => item._id.equals(_id));
}

function taskById(tasks: MeetingTask[] | undefined, taskId: ObjectId): MeetingTask | undefined {
  return (tasks ?? []).find((item) => item._id.equals(taskId));
}

function setOwnedTaskStatus(
  rows: WithId<Meeting>[],
  actor: Actor,
  id: string,
  taskId: string,
  status: TaskStatus,
  at: Date,
): SetTaskStatusResult {
  const meeting = rowById(rows, id);
  if (meeting === undefined || meeting.userId !== actor.id) {
    return { kind: "missing" };
  }
  const taskObjectId = asObjectId(taskId);
  if (!taskObjectId) {
    return { kind: "missing" };
  }
  const task = taskById(meeting.tasks, taskObjectId);
  if (task === undefined) {
    return { kind: "missing" };
  }
  if (task.status === status) {
    return { kind: "unchanged", task };
  }
  task.status = status;
  task.updatedAt = at;
  return { kind: "updated", task };
}

function applyStatus(rows: WithId<Meeting>[], id: string, status: MeetingStatus, error?: string) {
  const meeting = rowById(rows, id);
  if (meeting === undefined) {
    return;
  }
  meeting.status = status;
  if (error === undefined) {
    delete meeting.error;
    return;
  }
  meeting.error = error;
}

export function createMemoryMeetings(seed: WithId<Meeting>[] = []): MemoryMeetings {
  const rows: WithId<Meeting>[] = [...seed];

  const store: MeetingsStore = {
    createId: () => new ObjectId(),
    setStatus: async (id, status) => {
      applyStatus(rows, id, status);
    },
    setReady: async (id, summary: StoredMeetingSummary, tasks: MeetingTask[]) => {
      const meeting = rowById(rows, id);
      if (meeting === undefined) {
        return;
      }
      meeting.status = "ready";
      meeting.summary = summary;
      meeting.tasks = tasks;
      delete meeting.error;
    },
    setFailed: async (id, error) => {
      applyStatus(rows, id, "failed", error);
    },
  };

  const meetings: Meetings = {
    createId: () => store.createId(),
    get: async (actor, id) => {
      const meeting = rowById(rows, id);
      if (meeting === undefined || meeting.userId !== actor.id) {
        return null;
      }
      return meeting;
    },
    list: async (actor, skip, limit, query) => {
      const filter = scopedFilter(actor, query);
      return rows
        .filter((item) => matchesFilter(item, filter))
        .sort(byNewest)
        .slice(skip, skip + limit);
    },
    count: async (actor, query) => {
      const filter = scopedFilter(actor, query);
      return rows.filter((item) => matchesFilter(item, filter)).length;
    },
    insert: async (actor, draft) => {
      rows.push({ ...draft, userId: actor.id });
    },
    setTaskStatus: async (actor, id, taskId, status, at) =>
      setOwnedTaskStatus(rows, actor, id, taskId, status, at),
    setFailed: async (actor, id, error) => {
      const meeting = rowById(rows, id);
      if (meeting === undefined || meeting.userId !== actor.id) {
        return;
      }
      meeting.status = "failed";
      meeting.error = error;
    },
  };

  return { meetings, store };
}
