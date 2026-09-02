import { serve } from "@hono/node-server";
import { minioBlobFromEnv } from "./lib/blob/minio/minio-blob.ts";
import { loadSettings, settingsFileUrl } from "./lib/config/index.ts";
import { mongoFromEnv } from "./lib/db/mongo/mongo-db.ts";
import { createOpenaiSummarize } from "./lib/summarize/openai/openai-summarize.ts";
import { createOpenaiTranscribe } from "./lib/transcribe/openai/openai-transcribe.ts";
import { createFfmpegVideo } from "./lib/video/ffmpeg/ffmpeg-video.ts";
import { createApp } from "./create-app.ts";
import { createMeetingsStore } from "./features/meetings/store.ts";

const port = Number(process.env.PORT) || 3000;
const settings = await loadSettings(settingsFileUrl);

const app = createApp({
  video: createFfmpegVideo(),
  blob: minioBlobFromEnv(),
  transcribe: createOpenaiTranscribe(settings.models.transcribe),
  summarize: createOpenaiSummarize(settings.models.summary),
  meetings: createMeetingsStore(await mongoFromEnv()),
  settings,
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
});

console.log(`Listening on ${port}`);
