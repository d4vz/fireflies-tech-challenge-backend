import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  matchingTasks,
  tasksFromActionItems,
  toPublicMeetingTask,
  type MeetingTask,
} from "./tasks.ts";

test("tasksFromActionItems assigns ids, pending, and updatedAt", () => {
  const ids = [new ObjectId(), new ObjectId()];
  let i = 0;
  const at = new Date("2026-09-01T12:00:00.000Z");
  const tasks = tasksFromActionItems(["review notes", "send recap"], () => ids[i++]!, at);
  assert.deepEqual(tasks, [
    { _id: ids[0], text: "review notes", status: "pending", updatedAt: at },
    { _id: ids[1], text: "send recap", status: "pending", updatedAt: at },
  ]);
});

test("tasksFromActionItems drops blank strings", () => {
  const tasks = tasksFromActionItems(["  ", "keep", ""], () => new ObjectId(), new Date());
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.text, "keep");
});

test("matchingTasks filters by status and treats missing as empty", () => {
  const at = new Date("2026-09-01T12:00:00.000Z");
  const pending: MeetingTask = {
    _id: new ObjectId(),
    text: "open",
    status: "pending",
    updatedAt: at,
  };
  const done: MeetingTask = {
    _id: new ObjectId(),
    text: "done",
    status: "completed",
    updatedAt: at,
  };
  assert.deepEqual(matchingTasks([pending, done], undefined), [pending, done]);
  assert.deepEqual(matchingTasks([pending, done], "pending"), [pending]);
  assert.deepEqual(matchingTasks([pending, done], "completed"), [done]);
  assert.deepEqual(matchingTasks(undefined, "pending"), []);
});

test("toPublicMeetingTask uses hex id and ISO time", () => {
  const id = new ObjectId("6a963d4f786296c73b01d6d0");
  const at = new Date("2026-09-01T12:00:00.000Z");
  assert.deepEqual(
    toPublicMeetingTask({ _id: id, text: "review notes", status: "pending", updatedAt: at }),
    {
      _id: "6a963d4f786296c73b01d6d0",
      text: "review notes",
      status: "pending",
      updatedAt: "2026-09-01T12:00:00.000Z",
    },
  );
});
