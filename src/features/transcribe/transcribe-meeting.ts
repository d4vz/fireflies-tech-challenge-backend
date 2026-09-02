import type { Audio } from "../../../lib/audio/index.ts";
import type { Blob, PutBlob } from "../../../lib/blob/index.ts";
import type { Transcribe } from "../../../lib/transcribe/index.ts";
import { meetingTranscriptKey, meetingVideoKey } from "../../entities/meeting.ts";

export type TranscribeMeetingDeps = {
  audio: Audio;
  blob: Blob;
  transcribe: Transcribe;
};

export type TranscribeMeetingResult = {
  meetingId: string;
  text: string;
  videoKey: string;
  transcriptKey: string;
};

export async function transcribeMeeting(
  deps: TranscribeMeetingDeps,
  file: File,
): Promise<TranscribeMeetingResult> {
  const meetingId = crypto.randomUUID();
  const videoKey = meetingVideoKey(meetingId);
  const video: PutBlob = {
    key: videoKey,
    body: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type || "video/mp4",
  };
  await deps.blob.put(video);

  const audioFile = await deps.audio.extract(file);
  const { text } = await deps.transcribe.run(audioFile);

  const transcriptKey = meetingTranscriptKey(meetingId);
  const transcript: PutBlob = {
    key: transcriptKey,
    body: new TextEncoder().encode(JSON.stringify({ text })),
    contentType: "application/json",
  };
  await deps.blob.put(transcript);

  return { meetingId, text, videoKey, transcriptKey };
}
