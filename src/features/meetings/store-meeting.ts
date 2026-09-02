import { createReadStream } from "node:fs";
import type { Blob } from "../../lib/blob/index.ts";
import type { Queue } from "../../lib/queue/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { meetingThumbnailKey, meetingVideoKey, type MeetingsStore } from "./store.ts";

export type StoreMeetingDeps = {
  video: Video;
  blob: Blob;
  meetings: MeetingsStore;
  queue: Queue;
};

export async function storeMeeting(
  deps: StoreMeetingDeps,
  file: { name: string; type: string; size: number; path: string },
) {
  const { video, blob, meetings, queue } = deps;
  const _id = meetings.createId();
  const id = _id.toHexString();

  async function storeThumbnail() {
    const thumb = await video.thumbnail(file.path);
    const body = new Uint8Array(await thumb.arrayBuffer());
    return blob.put({
      key: meetingThumbnailKey(id),
      body,
      contentType: thumb.type || "image/jpeg",
      size: body.byteLength,
    });
  }

  const [url, durationInSeconds, thumbnailUrl] = await Promise.all([
    blob.put({
      key: meetingVideoKey(id),
      body: createReadStream(file.path),
      contentType: file.type || "video/mp4",
      size: file.size,
    }),
    video.durationInSeconds(file.path),
    storeThumbnail(),
  ]);

  const meeting = {
    _id,
    sourceType: "upload" as const,
    sourceId: file.name || "video",
    createdAt: new Date(),
    status: "queued" as const,
    blob: {
      url,
      durationInSeconds,
      sizeInBytes: file.size,
      thumbnailUrl,
    },
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
