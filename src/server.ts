import { serve } from "@hono/node-server";
import { minioBlobFromEnv } from "./lib/blob/minio/minio-blob.ts";
import { mongoFromEnv } from "./lib/db/mongo/mongo-db.ts";
import { createOpenaiTranscribe } from "./lib/transcribe/openai/openai-transcribe.ts";
import { createFfmpegVideo } from "./lib/video/ffmpeg/ffmpeg-video.ts";
import { createApp } from "./create-app.ts";
import { createMeetingsStore } from "./features/meetings/meetings.ts";

const port = Number(process.env.PORT) || 3000;

const app = createApp({
  video: createFfmpegVideo(),
  blob: minioBlobFromEnv(),
  transcribe: createOpenaiTranscribe(),
  meetings: createMeetingsStore(await mongoFromEnv()),
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
});

console.log(`Listening on ${port}`);
