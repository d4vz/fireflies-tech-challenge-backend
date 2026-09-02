import { ObjectId } from "mongodb";

export type TaskStatus = "pending" | "completed";

export type MeetingTask = {
  _id: ObjectId;
  text: string;
  status: TaskStatus;
  updatedAt: Date;
};

export type PublicMeetingTask = {
  _id: string;
  text: string;
  status: TaskStatus;
  updatedAt: string;
};

export function tasksFromActionItems(
  items: string[],
  createId: () => ObjectId,
  at: Date,
): MeetingTask[] {
  const tasks: MeetingTask[] = [];
  for (const item of items) {
    const text = item.trim();
    if (text === "") {
      continue;
    }
    tasks.push({
      _id: createId(),
      text,
      status: "pending",
      updatedAt: at,
    });
  }
  return tasks;
}

export function matchingTasks(
  tasks: MeetingTask[] | undefined,
  status: TaskStatus | undefined,
): MeetingTask[] {
  const list = tasks ?? [];
  if (status === undefined) {
    return list;
  }
  return list.filter((task) => task.status === status);
}

export function toPublicMeetingTask(task: MeetingTask): PublicMeetingTask {
  return {
    _id: task._id.toHexString(),
    text: task.text,
    status: task.status,
    updatedAt: task.updatedAt.toISOString(),
  };
}
