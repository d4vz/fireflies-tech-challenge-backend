const MEDIA_EXTS = [
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".m4v",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
] as const;

function stripMediaExt(value: string): string {
  const lower = value.toLowerCase();
  for (const ext of MEDIA_EXTS) {
    if (!lower.endsWith(ext)) {
      continue;
    }
    const stem = value.slice(0, -ext.length).trim();
    if (stem !== "") {
      return stem;
    }
  }
  return value;
}

export function meetingName(sourceId: string, name?: string): string {
  const stored = name?.trim();
  if (stored !== undefined && stored !== "") {
    return stripMediaExt(stored);
  }
  return stripMediaExt(sourceId);
}

export function withMeetingName<T extends { sourceId: string; name?: string }>(
  meeting: T,
): T & { name: string } {
  return { ...meeting, name: meetingName(meeting.sourceId, meeting.name) };
}
