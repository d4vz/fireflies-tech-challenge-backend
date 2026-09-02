export type MeetingId = string;

export function meetingVideoKey(meetingId: MeetingId): string {
  return `meetings/${meetingId}/video`;
}

export function meetingTranscriptKey(meetingId: MeetingId): string {
  return `meetings/${meetingId}/transcript.json`;
}
