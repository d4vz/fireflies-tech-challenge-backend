import { Hono } from "hono";
import type { LanguageModel } from "ai";
import type { Actor, AuthVerify } from "./lib/auth/index.ts";
import type { Blob } from "./lib/blob/index.ts";
import type { AppSettings } from "./lib/config/index.ts";
import type { Embed } from "./lib/embed/index.ts";
import { mountMiddleware, requireActor, type AppEnv } from "./lib/middleware/index.ts";
import type { Queue } from "./lib/queue/index.ts";
import type { Transcribe } from "./lib/transcribe/index.ts";
import type { Video } from "./lib/video/index.ts";
import { createAskFredTools } from "./features/ask-fred/tools.ts";
import { mountAskFred } from "./features/ask-fred/http.ts";
import { mountHealth } from "./features/health/http.ts";
import { listMeetings } from "./features/meetings/list-query.ts";
import { searchMeetingTranscripts, searchTranscripts } from "./features/meetings/search.ts";
import { mountMeetings } from "./features/meetings/http.ts";
import { forActor, type MeetingsStore } from "./features/meetings/store.ts";
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
  app.use("*", requireActor(deps.auth));
  const ownedMeetings = (actor: Actor) => forActor(deps.meetings, actor);
  mountMeetings(app, { ...deps, ownedMeetings });

  mountAskFred(app, {
    model: deps.model,
    origin: deps.origin,
    toolsFor: (actor) => {
      const owned = ownedMeetings(actor);
      return createAskFredTools({
        model: deps.model,
        listMeetings: (query) => listMeetings(owned, query),
        searchTranscripts: (query) =>
          searchTranscripts(
            { meetings: owned, transcripts: deps.transcripts, embed: deps.embed },
            query,
          ),
        searchMeetingTranscripts: (query) =>
          searchMeetingTranscripts(
            { meetings: owned, transcripts: deps.transcripts, embed: deps.embed },
            query,
          ),
      });
    },
  });

  return app;
}
