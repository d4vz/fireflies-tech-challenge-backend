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

export function turnsFromTranscript(transcript: Transcript): PublicTranscriptTurn[] {
  return transcript.segments.map((segment, index) => ({ ...segment, index }));
}

function logMeeting(meetingId: string, message: string) {
  console.log(`[meeting ${meetingId}] ${message}`);
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
    const transcript = await meetingStep(meetingId, "transcribe", () => transcribe.run(audioPath));
    const turns = turnsFromTranscript(transcript);
    logMeeting(meetingId, `turns ${turns.length}`);
    const chunks = turns.flatMap((turn) =>
      chunkText(turn.text, settings.chunkSize).map((text) => ({ turn, text })),
    );
    const labeled = chunks.map((chunk) => labeledTurnText(chunk.turn.speaker, chunk.text));
    const embeddings = await meetingStep(meetingId, "embed", () => embed.run(labeled));
    if (embeddings.length !== chunks.length) {
      throw new Error("embed count mismatch");
    }
    const storedChunks: NewTranscriptChunk[] = chunks.map((chunk, index) => ({
      index,
      turnIndex: chunk.turn.index,
      speaker: chunk.turn.speaker,
      start: chunk.turn.start,
      end: chunk.turn.end,
      turnText: chunk.turn.text,
      text: chunk.text,
      embedding: embeddings[index],
      model: embed.model,
    }));
    await meetingStep(meetingId, "save transcripts", () =>
      transcripts.replaceAll(meetingId, storedChunks),
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
