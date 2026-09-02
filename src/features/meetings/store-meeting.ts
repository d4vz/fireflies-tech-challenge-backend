import { createReadStream } from "node:fs";
import type { Actor } from "../../lib/auth/index.ts";
import type { Blob } from "../../lib/blob/index.ts";
import type { Queue } from "../../lib/queue/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { meetingName } from "./meeting-name.ts";
import type { ClassifiedFile } from "./upload-file.ts";
import {
  meetingThumbnailKey,
  meetingVideoKey,
  type MeetingBlob,
  type MeetingsStore,
} from "./store.ts";

export type StoreMeetingDeps = {
  video: Video;
  blob: Blob;
  meetings: MeetingsStore;
  queue: Queue;
};

async function storeThumbnail(
  deps: StoreMeetingDeps,
  filePath: string,
  id: string,
): Promise<string> {
  const thumb = await deps.video.thumbnail(filePath);
  const body = new Uint8Array(await thumb.arrayBuffer());
  return deps.blob.put({
    key: meetingThumbnailKey(id),
    body,
    contentType: thumb.type || "image/jpeg",
    size: body.byteLength,
  });
}

export async function storeMeeting(
  deps: StoreMeetingDeps,
  file: ClassifiedFile,
  actor: Actor,
  name?: string,
) {
  const { video, blob, meetings, queue } = deps;
  const _id = meetings.createId();
  const id = _id.toHexString();
  const contentType = file.type || (file.kind === "audio" ? "audio/mpeg" : "video/mp4");

  const original = blob.put({
    key: meetingVideoKey(id),
    body: createReadStream(file.path),
    contentType,
    size: file.size,
  });
  const duration = video.durationInSeconds(file.path);

  let meetingBlob: MeetingBlob;
  switch (file.kind) {
    case "video": {
      const [url, durationInSeconds, thumbnailUrl] = await Promise.all([
        original,
        duration,
        storeThumbnail(deps, file.path, id),
      ]);
      meetingBlob = {
        kind: "video",
        url,
        durationInSeconds,
        sizeInBytes: file.size,
        thumbnailUrl,
      };
      break;
    }
    case "audio": {
      const [url, durationInSeconds] = await Promise.all([original, duration]);
      meetingBlob = {
        kind: "audio",
        url,
        durationInSeconds,
        sizeInBytes: file.size,
      };
      break;
    }
    default: {
      const _exhaustive: never = file.kind;
      return _exhaustive;
    }
  }

  const meeting = {
    _id,
    userId: actor.id,
    sourceType: "upload" as const,
    sourceId: file.name || "video",
    name: meetingName(file.name || "video", name),
    createdAt: new Date(),
    status: "queued" as const,
    blob: meetingBlob,
  };

  await meetings.insert(meeting);
  try {
    await queue.enqueue(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "queue failed";
    await meetings.setFailed(id, message);
    throw error;
  }
  return meeting;
}
