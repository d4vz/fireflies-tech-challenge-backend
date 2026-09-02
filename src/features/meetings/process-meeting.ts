import type { Blob } from "../../lib/blob/index.ts";
import type { AppSettings } from "../../lib/config/index.ts";
import type { Embed } from "../../lib/embed/index.ts";
import { isRetryableJobError } from "../../lib/queue/index.ts";
import type { Summarize } from "../../lib/summarize/index.ts";
import { labeledTurnText, type Transcript, type Transcribe } from "../../lib/transcribe/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { meetingVideoKey, type MeetingsStore } from "./store.ts";
import { tasksFromActionItems } from "./tasks.ts";
import { tempFileFrom } from "./temp-file.ts";
import type { NewTranscriptChunk, PublicTranscriptTurn, TranscriptsStore } from "./transcripts.ts";

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
  let offset = 0;
  while (offset < text.length) {
    const remaining = text.length - offset;
    if (remaining <= size) {
      chunks.push(text.slice(offset));
      break;
    }
    const window = text.slice(offset, offset + size);
    const breakAt = window.lastIndexOf(" ");
    if (breakAt > 0) {
      chunks.push(text.slice(offset, offset + breakAt));
      offset += breakAt + 1;
      continue;
    }
    chunks.push(window);
    offset += size;
  }
  return chunks;
}

export function rowsFromTranscript(
  transcript: Transcript,
  chunkSize: number,
): PublicTranscriptTurn[] {
  const rows: PublicTranscriptTurn[] = [];
  let index = 0;
  for (const segment of transcript.segments) {
    for (const text of chunkText(segment.text, chunkSize)) {
      rows.push({
        index,
        speaker: segment.speaker,
        start: segment.start,
        end: segment.end,
        text,
      });
      index += 1;
    }
  }
  return rows;
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
    const transcript = await transcribe.run(audioPath);
    const rows = rowsFromTranscript(transcript, settings.chunkSize);
    const labeled = rows.map((row) => labeledTurnText(row.speaker, row.text));
    const embeddings = await embed.run(labeled);
    if (embeddings.length !== rows.length) {
      throw new Error("embed count mismatch");
    }
    const chunks: NewTranscriptChunk[] = rows.map((row, index) => ({
      index: row.index,
      speaker: row.speaker,
      start: row.start,
      end: row.end,
      text: row.text,
      embedding: embeddings[index],
      model: embed.model,
    }));
    await transcripts.insertAll(meetingId, chunks);
    const summary = await summarize.run(transcript.text);
    const tasks = tasksFromActionItems(summary.actionItems, meetings.createId, new Date());
    await meetings.setReady(meetingId, { text: summary.text, takeaways: summary.takeaways }, tasks);
  } finally {
    await temp.close();
  }
}

export async function processMeetingJob(
  deps: ProcessMeetingDeps,
  meetingId: string,
  options: { lastAttempt: boolean } = { lastAttempt: true },
) {
  try {
    await processMeeting(deps, meetingId);
  } catch (error) {
    if (error instanceof Error && isRetryableJobError(error) && !options.lastAttempt) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "processing failed";
    await deps.meetings.setFailed(meetingId, message);
    throw error;
  }
}
