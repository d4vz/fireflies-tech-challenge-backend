import type { Blob } from "../../lib/blob/index.ts";
import type { AppSettings } from "../../lib/config/index.ts";
import type { Embed } from "../../lib/embed/index.ts";
import type { Summarize } from "../../lib/summarize/index.ts";
import type { Transcribe } from "../../lib/transcribe/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { meetingVideoKey, type MeetingsStore } from "./store.ts";
import { tasksFromActionItems } from "./tasks.ts";
import { tempFileFrom } from "./temp-file.ts";
import type { TranscriptsStore } from "./transcripts.ts";

export type ProcessMeetingDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  summarize: Summarize;
  embed: Embed;
  meetings: MeetingsStore;
  transcripts: TranscriptsStore;
  settings: AppSettings;
};

export function chunkText(text: string, size: number) {
  if (text.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += size) {
    chunks.push(text.slice(offset, offset + size));
  }
  return chunks;
}

export async function processMeeting(deps: ProcessMeetingDeps, meetingId: string) {
  const { video, blob, transcribe, summarize, embed, meetings, transcripts, settings } = deps;
  await meetings.setStatus(meetingId, "processing");

  const stored = await blob.get(meetingVideoKey(meetingId));
  if (!stored) {
    throw new Error("video is missing");
  }

  const temp = await tempFileFrom(stored.body, "meeting-", "video");
  try {
    const audioPath = await video.extract(temp.path);
    const { text } = await transcribe.run(audioPath);
    const parts = chunkText(text, settings.chunkSize);
    const embeddings = await embed.run(parts);
    if (embeddings.length !== parts.length) {
      throw new Error("embed count mismatch");
    }
    await transcripts.insertAll(
      meetingId,
      parts.map((part, index) => ({
        index,
        text: part,
        embedding: embeddings[index],
        model: embed.model,
      })),
    );
    const summary = await summarize.run(text);
    const tasks = tasksFromActionItems(summary.actionItems, meetings.createId, new Date());
    await meetings.setReady(meetingId, { text: summary.text, takeaways: summary.takeaways }, tasks);
  } finally {
    await temp.close();
  }
}

export async function processMeetingJob(deps: ProcessMeetingDeps, meetingId: string) {
  try {
    await processMeeting(deps, meetingId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing failed";
    await deps.meetings.setFailed(meetingId, message);
    throw error;
  }
}
