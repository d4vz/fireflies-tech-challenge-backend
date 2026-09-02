import type { Blob } from "../../lib/blob/index.ts";
import type { AppSettings } from "../../lib/config/index.ts";
import type { Summarize } from "../../lib/summarize/index.ts";
import type { Transcribe } from "../../lib/transcribe/index.ts";
import type { Video } from "../../lib/video/index.ts";
import {
  meetingThumbnailKey,
  meetingVideoKey,
  transcriptStats,
  type MeetingsStore,
} from "./store.ts";

export type UploadMeetingDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  summarize: Summarize;
  meetings: MeetingsStore;
  settings: AppSettings;
};

export type UploadStage = "storing" | "transcribing" | "summarizing" | "saving";

export type UploadEvent =
  | { event: "progress"; stage: UploadStage }
  | { event: "done"; meeting: Parameters<MeetingsStore["insert"]>[0] };

export async function* uploadMeeting(
  deps: UploadMeetingDeps,
  file: File,
): AsyncGenerator<UploadEvent> {
  const { video, blob, transcribe, summarize, meetings, settings } = deps;
  const _id = meetings.createId();

  async function storeThumbnail() {
    const thumb = await video.thumbnail(file);
    return blob.put({
      key: meetingThumbnailKey(_id.toHexString()),
      body: new Uint8Array(await thumb.arrayBuffer()),
      contentType: thumb.type || "image/jpeg",
    });
  }

  async function transcribeFile() {
    const audioFile = await video.extract(file);
    return transcribe.run(audioFile);
  }

  yield { event: "progress", stage: "storing" };
  const [url, durationInSeconds, thumbnailUrl] = await Promise.all([
    file.arrayBuffer().then((body) =>
      blob.put({
        key: meetingVideoKey(_id.toHexString()),
        body: new Uint8Array(body),
        contentType: file.type || "video/mp4",
      }),
    ),
    video.durationInSeconds(file),
    storeThumbnail(),
  ]);

  yield { event: "progress", stage: "transcribing" };
  const { text } = await transcribeFile();

  yield { event: "progress", stage: "summarizing" };
  const summary = await summarize.run(text);

  const meeting = {
    _id,
    sourceType: "upload" as const,
    sourceId: file.name || "video",
    createdAt: new Date(),
    transcript: transcriptStats(text, settings.chunkSize),
    summary,
    blob: {
      url,
      durationInSeconds,
      sizeInBytes: file.size,
      thumbnailUrl,
    },
  };

  yield { event: "progress", stage: "saving" };
  await meetings.insert(meeting);
  yield { event: "done", meeting };
}
