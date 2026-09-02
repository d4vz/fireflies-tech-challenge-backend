import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { storeMeeting } from "./store-meeting.ts";
import type { ClassifiedFile } from "./upload-file.ts";
import type { Meeting, MeetingsStore } from "./store.ts";

function unused(): never {
  throw new Error("unused");
}

test("storeMeeting skips thumbnail for an mp3 ClassifiedFile", async () => {
  let thumbnailCalls = 0;
  const keys: string[] = [];
  const inserted: Meeting[] = [];
  const meetings: MeetingsStore = {
    createId: () => new ObjectId("6a963d4f786296c73b01d6d0"),
    insert: async (meeting) => {
      inserted.push(meeting);
    },
    get: async () => unused(),
    list: async () => unused(),
    count: async () => unused(),
    setStatus: async () => unused(),
    setReady: async () => unused(),
    setFailed: async () => unused(),
  };
  const file: ClassifiedFile = {
    name: "talk.mp3",
    type: "audio/mpeg",
    size: 12,
    path: "/dev/null",
    kind: "audio",
  };
  const meeting = await storeMeeting(
    {
      video: {
        extract: async () => unused(),
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
  );
  assert.equal(thumbnailCalls, 0);
  assert.deepEqual(keys, ["meetings/6a963d4f786296c73b01d6d0/video"]);
  assert.equal(meeting.blob.kind, "audio");
  assert.equal(meeting.userId, ownerId("user_a"));
  assert.equal(inserted[0]?.blob.kind, "audio");
  assert.equal(inserted[0]?.userId, ownerId("user_a"));
});
