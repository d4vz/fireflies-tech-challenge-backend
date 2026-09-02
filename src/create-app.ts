import { Hono } from "hono";
import type { LanguageModel } from "ai";
import type { AuthVerify } from "./lib/auth/index.ts";
import type { Blob } from "./lib/blob/index.ts";
import type { AppSettings } from "./lib/config/index.ts";
import type { Embed } from "./lib/embed/index.ts";
import { mountMiddleware, mountRequireActor, type AppEnv } from "./lib/middleware/index.ts";
import type { Queue } from "./lib/queue/index.ts";
import type { Transcribe } from "./lib/transcribe/index.ts";
import type { Video } from "./lib/video/index.ts";
import { mountAskFred } from "./features/ask-fred/http.ts";
import { mountHealth } from "./features/health/http.ts";
import { mountMeetings } from "./features/meetings/http.ts";
import type { MeetingsStore } from "./features/meetings/store.ts";
import type { TranscriptsStore } from "./features/meetings/transcripts.ts";

export type CreateAppDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
  meetings: MeetingsStore;
  transcripts: TranscriptsStore;
  queue: Queue;
  settings: AppSettings;
  embed: Embed;
  model: LanguageModel;
  auth: AuthVerify;
  origin?: string;
};

export function createApp(deps: CreateAppDeps) {
  const app = new Hono<AppEnv>();
  mountMiddleware(app);
  mountHealth(app, deps);
  mountRequireActor(app, deps.auth);
  mountMeetings(app, deps);
  mountAskFred(app, deps);
  return app;
}
