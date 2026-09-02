import { ObjectId, type Collection, type Filter, type MongoClient, type WithId } from "mongodb";
import type { Actor } from "../../lib/auth/index.ts";
import {
  asObjectId,
  parseMeetingBlob,
  scopedFilter,
  type Meeting,
  type MeetingFilter,
  type Meetings,
  type MeetingsStore,
  type SetTaskStatusResult,
} from "./store.ts";
import type { MeetingTask, TaskStatus } from "./tasks.ts";

export type MongoMeetings = {
  meetings: Meetings;
  store: MeetingsStore;
};

type CreatedAtBounds = {
  $gte?: Date;
  $lt?: Date;
};

function mongoFilter(filter: MeetingFilter): Filter<Meeting> {
  const query: Filter<Meeting> = { userId: filter.userId };
  if (filter.status !== undefined) {
    query.status = filter.status;
  }
  if (filter.sourceId !== undefined) {
    query.sourceId = filter.sourceId;
  }
  if (filter.taskStatus !== undefined) {
    query.tasks = { $elemMatch: { status: filter.taskStatus } };
  } else if (filter.hasTasks === true) {
    query.tasks = { $elemMatch: {} };
  }
  if (filter.from === undefined && filter.to === undefined) {
    return query;
  }
  const createdAt: CreatedAtBounds = {};
  if (filter.from !== undefined) {
    createdAt.$gte = filter.from;
  }
  if (filter.to !== undefined) {
    // Exclusive `to` so a day query is [startOfDay, startOfNextDay).
    createdAt.$lt = filter.to;
  }
  query.createdAt = createdAt;
  return query;
}

function withParsedBlob(doc: WithId<Meeting>): WithId<Meeting> {
  return { ...doc, blob: parseMeetingBlob(doc.blob) };
}

function taskById(tasks: MeetingTask[] | undefined, taskId: ObjectId): MeetingTask | undefined {
  return (tasks ?? []).find((item) => item._id.equals(taskId));
}

async function setOwnedTaskStatus(
  collection: Collection<Meeting>,
  actor: Actor,
  id: string,
  taskId: string,
  status: TaskStatus,
  at: Date,
): Promise<SetTaskStatusResult> {
  const _id = asObjectId(id);
  const taskObjectId = asObjectId(taskId);
  if (!_id || !taskObjectId) {
    return { kind: "missing" };
  }
  const updated = await collection.findOneAndUpdate(
    {
      _id,
      userId: actor.id,
      tasks: { $elemMatch: { _id: taskObjectId, status: { $ne: status } } },
    },
    { $set: { "tasks.$[task].status": status, "tasks.$[task].updatedAt": at } },
    { arrayFilters: [{ "task._id": taskObjectId }], returnDocument: "after" },
  );
  if (updated) {
    const task = taskById(updated.tasks, taskObjectId);
    if (task === undefined) {
      return { kind: "missing" };
    }
    return { kind: "updated", task };
  }
  const existing = await collection.findOne({ _id, userId: actor.id, "tasks._id": taskObjectId });
  if (!existing) {
    return { kind: "missing" };
  }
  const task = taskById(existing.tasks, taskObjectId);
  if (task === undefined) {
    return { kind: "missing" };
  }
  return { kind: "unchanged", task };
}

export function createMongoMeetings(client: MongoClient): MongoMeetings {
  const collection = client.db().collection<Meeting>("meetings");
  void collection.createIndex({ userId: 1, createdAt: -1 });

  const store: MeetingsStore = {
    createId: () => new ObjectId(),
    setStatus: async (id, status) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne({ _id }, { $set: { status }, $unset: { error: "" } });
    },
    setReady: async (id, summary, tasks) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne(
        { _id },
        { $set: { status: "ready", summary, tasks }, $unset: { error: "" } },
      );
    },
    setFailed: async (id, error) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne({ _id }, { $set: { status: "failed", error } });
    },
  };

  const meetings: Meetings = {
    createId: () => store.createId(),
    get: async (actor, id) => {
      const _id = asObjectId(id);
      if (!_id) {
        return null;
      }
      const doc = await collection.findOne({ _id, userId: actor.id });
      if (!doc) {
        return null;
      }
      return withParsedBlob(doc);
    },
    list: async (actor, skip, limit, query) => {
      const docs = await collection
        .find(mongoFilter(scopedFilter(actor, query)))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return docs.map(withParsedBlob);
    },
    count: async (actor, query) =>
      collection.countDocuments(mongoFilter(scopedFilter(actor, query))),
    insert: async (actor, draft) => {
      await collection.insertOne({ ...draft, userId: actor.id });
    },
    setTaskStatus: (actor, id, taskId, status, at) =>
      setOwnedTaskStatus(collection, actor, id, taskId, status, at),
    setFailed: async (actor, id, error) => {
      const _id = asObjectId(id);
      if (!_id) {
        return;
      }
      await collection.updateOne({ _id, userId: actor.id }, { $set: { status: "failed", error } });
    },
  };

  return { meetings, store };
}

export function createMeetingsStore(client: MongoClient): MeetingsStore {
  return createMongoMeetings(client).store;
}
