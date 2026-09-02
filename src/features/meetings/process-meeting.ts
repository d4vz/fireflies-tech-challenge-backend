import { stat } from "node:fs/promises";
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

export function transcribeWindows(
  durationSeconds: number,
  windowSeconds?: number,
): { start: number; duration: number }[] {
  if (windowSeconds === undefined || durationSeconds <= 0 || durationSeconds <= windowSeconds) {
    return [{ start: 0, duration: Math.max(durationSeconds, 0) }];
  }
  const windows: { start: number; duration: number }[] = [];
  let start = 0;
  while (start < durationSeconds) {
    windows.push({
      start,
      duration: Math.min(windowSeconds, durationSeconds - start),
    });
    start += windowSeconds;
  }
  return windows;
}

export function shiftTranscript(transcript: Transcript, offsetSeconds: number): Transcript {
  if (offsetSeconds === 0) {
    return transcript;
  }
  return {
    text: transcript.text,
    segments: transcript.segments.map((segment) => ({
      ...segment,
      start: segment.start + offsetSeconds,
      end: segment.end + offsetSeconds,
    })),
  };
}

export function joinTranscripts(parts: Transcript[]): Transcript {
  const segments = parts.flatMap((part) => part.segments);
  return {
    text: parts
      .map((part) => part.text)
      .filter((text) => text.length > 0)
      .join("\n"),
    segments,
  };
}

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

function logMeeting(meetingId: string, message: string) {
  console.log(`[meeting ${meetingId}] ${message}`);
}

async function transcribeWindowsOf(
  meetingId: string,
  transcribe: Transcribe,
  video: Video,
  audioPath: string,
  windows: { start: number; duration: number }[],
): Promise<Transcript> {
  if (windows.length <= 1) {
    return transcribe.run(audioPath);
  }
  const parts: Transcript[] = [];
  for (const [index, window] of windows.entries()) {
    logMeeting(meetingId, `transcribe window ${index + 1}/${windows.length} at ${window.start}s`);
    const slicePath = await video.slice(audioPath, window.start, window.duration);
    const part = await transcribe.run(slicePath);
    parts.push(shiftTranscript(part, window.start));
  }
  return joinTranscripts(parts);
}

async function meetingStep<T>(meetingId: string, step: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  logMeeting(meetingId, `${step} start`);
  try {
    const value = await run();
    logMeeting(meetingId, `${step} done ${Date.now() - started}ms`);
    return value;
  } catch (error) {
    logMeeting(meetingId, `${step} failed ${Date.now() - started}ms`);
    throw error;
  }
}

export async function processMeeting(deps: ProcessMeetingDeps, meetingId: string) {
  const { video, blob, transcribe, summarize, embed, meetings, transcripts, settings } = deps;
  logMeeting(meetingId, "job start");
  await meetings.setStatus(meetingId, "processing");

  const stored = await meetingStep(meetingId, "download blob", () =>
    blob.get(meetingVideoKey(meetingId)),
  );
  if (!stored) {
    throw new Error("video is missing");
  }

  const temp = await tempFileFrom(stored.body, "meeting-", "video");
  try {
    const audioPath = await meetingStep(meetingId, "extract audio", () => video.extract(temp.path));
    const audioBytes = (await stat(audioPath)).size;
    logMeeting(meetingId, `audio ${audioBytes} bytes`);
    const duration = await video.durationInSeconds(audioPath);
    const windows = transcribeWindows(duration, transcribe.windowSeconds);
    logMeeting(meetingId, `audio ${duration}s ${windows.length} window(s)`);
    const transcript = await meetingStep(meetingId, "transcribe", () =>
      transcribeWindowsOf(meetingId, transcribe, video, audioPath, windows),
    );
    const rows = rowsFromTranscript(transcript, settings.chunkSize);
    logMeeting(meetingId, `turns ${rows.length}`);
    const labeled = rows.map((row) => labeledTurnText(row.speaker, row.text));
    const embeddings = await meetingStep(meetingId, "embed", () => embed.run(labeled));
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
    await meetingStep(meetingId, "save transcripts", () =>
      transcripts.insertAll(meetingId, chunks),
    );
    const summary = await meetingStep(meetingId, "summarize", () => summarize.run(transcript.text));
    const tasks = tasksFromActionItems(summary.actionItems, meetings.createId, new Date());
    await meetingStep(meetingId, "mark ready", () =>
      meetings.setReady(meetingId, { text: summary.text, takeaways: summary.takeaways }, tasks),
    );
    logMeeting(meetingId, "job done");
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
      console.log(`[meeting ${meetingId}] retryable error, waiting to retry`);
      throw error;
    }
    const message = error instanceof Error ? error.message : "processing failed";
    console.log(`[meeting ${meetingId}] job failed ${message}`);
    await deps.meetings.setFailed(meetingId, message);
    throw error;
  }
}
