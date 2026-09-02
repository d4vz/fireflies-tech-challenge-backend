import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { ownerId } from "../../lib/auth/index.ts";
import { createMemoryMeetings } from "./memory-meetings.ts";
import { storeMeeting } from "./store-meeting.ts";
import type { ClassifiedFile } from "./upload-file.ts";

function unused(): never {
  throw new Error("unused");
}

test("storeMeeting skips thumbnail for an mp3 ClassifiedFile", async () => {
  let thumbnailCalls = 0;
  const keys: string[] = [];
  const { meetings: owned } = createMemoryMeetings();
  const meetings = {
    ...owned,
    createId: () => new ObjectId("6a963d4f786296c73b01d6d0"),
  };
  const file: ClassifiedFile = {
    name: "talk.mp3",
    type: "audio/mpeg",
    size: 12,
    path: "/dev/null",
    kind: "audio",
  };
  const actor = { id: ownerId("user_a") };
  const meeting = await storeMeeting(
    {
      video: {
        extract: async () => unused(),
        slice: async () => unused(),
        durationInSeconds: async () => 8,
        thumbnail: async () => {
          thumbnailCalls += 1;
          return new File([new Uint8Array([0xff, 0xd8])], "thumb.jpg", { type: "image/jpeg" });
        },
      },
      blob: {
        put: async (input) => {
          keys.push(input.key);
          return `http://blob/${input.key}`;
        },
        get: async () => undefined,
        ping: async () => undefined,
      },
      meetings,
      queue: { enqueue: async () => undefined },
    },
    file,
    actor,
  );
  assert.equal(thumbnailCalls, 0);
  assert.deepEqual(keys, ["meetings/6a963d4f786296c73b01d6d0/video"]);
  assert.equal(meeting.blob.kind, "audio");
  assert.equal(meeting.name, "talk");
  assert.equal(meeting.sourceId, "talk.mp3");
  assert.equal(meeting.userId, ownerId("user_a"));
  const stored = await meetings.get(actor, "6a963d4f786296c73b01d6d0");
  assert.equal(stored?.blob.kind, "audio");
  assert.equal(stored?.userId, ownerId("user_a"));
});
