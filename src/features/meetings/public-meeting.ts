import type { WithId } from "mongodb";
import { meetingName, withMeetingName } from "./meeting-name.ts";
import type { Meeting, MeetingMediaKind, MeetingStatus, StoredMeetingSummary } from "./store.ts";

export type PublicMeeting = {
  id: string;
  sourceId: string;
  name: string;
  createdAt: string;
  status: MeetingStatus;
  href: string;
  mediaKind: MeetingMediaKind;
  summary?: StoredMeetingSummary;
  error?: string;
};

export function meetingHref(id: string): string {
  return `/meetings/${id}`;
}

export function publicMeeting(meeting: WithId<Meeting>): PublicMeeting {
  const id = meeting._id.toHexString();
  const view: PublicMeeting = {
    id,
    sourceId: meeting.sourceId,
    name: meetingName(meeting.sourceId, meeting.name),
    createdAt: meeting.createdAt.toISOString(),
    status: meeting.status,
    href: meetingHref(id),
    mediaKind: meeting.blob.kind === "audio" ? "audio" : "video",
  };
  if (meeting.summary !== undefined) {
    view.summary = meeting.summary;
  }
  if (meeting.error !== undefined) {
    view.error = meeting.error;
  }
  return view;
}

export function withPublicCard<T extends WithId<Meeting>>(meeting: T) {
  const view = publicMeeting(meeting);
  return { ...withMeetingName(meeting), href: view.href, mediaKind: view.mediaKind };
}
