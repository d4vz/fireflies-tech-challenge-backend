# Backend context

## Terms

- **Actor** — a Clerk-authenticated caller. `Actor.id` is the owner id on every HTTP read and write.
- **Owned Meetings** — the Meetings module. Every method takes an Actor. Ownership is in the query (`userId: actor.id`), not a post-filter.
- **Meeting** — one uploaded video or audio blob, plus processing status, summary, and tasks.
- **Transcript chunk** — a slice of transcript text with an embedding. Chunks are keyed by `meetingId`, not `userId`.
- **Task** — an action item on a Meeting (`pending` or `completed`).
- **Store** — a persistence interface for one feature. Meetings has two: Owned Meetings (HTTP) and a privileged worker Store.

## Worker vs HTTP

The processing worker is not an Actor. It already holds a `meetingId` from the queue. `server.ts` passes `mongoMeetings.store` (`MeetingsStore`) into `processMeetingJob`, and `mongoMeetings.meetings` (`Meetings`) into `createApp`. HTTP never receives the privileged Store.
