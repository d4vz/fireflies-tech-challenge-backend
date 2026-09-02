import { Hono } from "hono";
import type { Blob } from "./lib/blob/index.ts";
import type { AppSettings } from "./lib/config/index.ts";
import { mountMiddleware } from "./lib/middleware/index.ts";
import type { Summarize } from "./lib/summarize/index.ts";
import type { Transcribe } from "./lib/transcribe/index.ts";
import type { Video } from "./lib/video/index.ts";
import { mountHealth } from "./features/health/http.ts";
import { mountMeetings } from "./features/meetings/http.ts";
import type { MeetingsStore } from "./features/meetings/store.ts";

export type CreateAppDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  summarize: Summarize;
  meetings: MeetingsStore;
  settings: AppSettings;
};

export function createApp(deps: CreateAppDeps) {
  const app = new Hono();
  mountMiddleware(app);
  mountHealth(app, deps);
  mountMeetings(app, deps);

  return app;
}
