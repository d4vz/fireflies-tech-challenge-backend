import { Hono } from "hono";
import type { Blob } from "./lib/blob/index.ts";
import type { Transcribe } from "./lib/transcribe/index.ts";
import type { Video } from "./lib/video/index.ts";
import { mountHealth } from "./features/health/http.ts";
import { mountMeetings } from "./features/meetings/http.ts";
import type { MeetingsStore } from "./features/meetings/meetings.ts";

export type CreateAppDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  meetings: MeetingsStore;
};

export function createApp(deps: CreateAppDeps) {
  const app = new Hono();

  mountHealth(app, deps);
  mountMeetings(app, deps);

  return app;
}
