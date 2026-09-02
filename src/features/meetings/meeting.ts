export type MeetingId = string;

export const TRANSCRIPT_CHUNK_SIZE = 500;

export type MeetingTranscript = {
  text: string;
  chunkSize: number;
  chunkCount: number;
  charLength: number;
};

export type MeetingBlob = {
  url: string;
  durationInSeconds: number;
  sizeInBytes: number;
  thumbnailUrl: string;
};

export type Meeting = {
  _id: MeetingId;
  sourceType: "upload";
  sourceId: string;
  createdAt: Date;
  transcript: MeetingTranscript;
  blob: MeetingBlob;
};

export function meetingVideoKey(meetingId: MeetingId): string {
  return `meetings/${meetingId}/video`;
}

export function meetingThumbnailKey(meetingId: MeetingId): string {
  return `meetings/${meetingId}/thumbnail.jpg`;
}

export function transcriptStats(text: string) {
  const charLength = text.length;
  const chunkCount = charLength === 0 ? 0 : Math.ceil(charLength / TRANSCRIPT_CHUNK_SIZE);
  return {
    text,
    chunkSize: TRANSCRIPT_CHUNK_SIZE,
    chunkCount,
    charLength,
  };
}
