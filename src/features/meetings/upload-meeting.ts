import type { Blob } from "../../lib/blob/index.ts";
import type { Transcribe } from "../../lib/transcribe/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { meetingThumbnailKey, meetingVideoKey, transcriptStats, type Meeting } from "./meeting.ts";
import type { MeetingsStore } from "./meetings.ts";

export type UploadMeetingDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  meetings: MeetingsStore;
};

export async function uploadMeeting(deps: UploadMeetingDeps, file: File): Promise<Meeting> {
  const { video, blob, transcribe, meetings } = deps;
  const _id = meetings.createId();

  async function storeThumbnail() {
    const thumb = await video.thumbnail(file);
    return blob.put({
      key: meetingThumbnailKey(_id),
      body: new Uint8Array(await thumb.arrayBuffer()),
      contentType: thumb.type || "image/jpeg",
    });
  }

  async function transcribeFile() {
    const audioFile = await video.extract(file);
    return transcribe.run(audioFile);
  }

  const [url, durationInSeconds, thumbnailUrl, { text }] = await Promise.all([
    file.arrayBuffer().then((body) =>
      blob.put({
        key: meetingVideoKey(_id),
        body: new Uint8Array(body),
        contentType: file.type || "video/mp4",
      }),
    ),
    video.durationInSeconds(file),
    storeThumbnail(),
    transcribeFile(),
  ]);

  const meeting: Meeting = {
    _id,
    sourceType: "upload",
    sourceId: file.name || "video",
    createdAt: new Date(),
    transcript: transcriptStats(text),
    blob: {
      url,
      durationInSeconds,
      sizeInBytes: file.size,
      thumbnailUrl,
    },
  };

  await meetings.insert(meeting);
  return meeting;
}
