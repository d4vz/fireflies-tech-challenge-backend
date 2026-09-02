import { serve } from "@hono/node-server";
import { minioBlobFromEnv } from "./lib/blob/minio/minio-blob.ts";
import { loadSettings, parseSecrets, settingsFileUrl } from "./lib/config/index.ts";
import { mongoFromEnv } from "./lib/db/mongo/mongo-db.ts";
import { createOpenaiEmbed } from "./lib/embed/openai/openai-embed.ts";
import { createBullmqQueue, startMeetingsWorker } from "./lib/queue/bullmq/bullmq-queue.ts";
import { createOpenaiSummarize } from "./lib/summarize/openai/openai-summarize.ts";
import { createOpenaiTranscribe } from "./lib/transcribe/openai/openai-transcribe.ts";
import { createFfmpegVideo } from "./lib/video/ffmpeg/ffmpeg-video.ts";
import { createApp } from "./create-app.ts";
import { processMeetingJob } from "./features/meetings/process-meeting.ts";
import { createMeetingsStore } from "./features/meetings/store.ts";
import { createTranscriptsStore } from "./features/meetings/transcripts.ts";

const port = Number(process.env.PORT) || 3000;
const settings = await loadSettings(settingsFileUrl);
const secrets = parseSecrets(process.env);
const mongo = await mongoFromEnv();
const blob = minioBlobFromEnv();
const video = createFfmpegVideo();
const transcribe = createOpenaiTranscribe(settings.models.transcribe);
const summarize = createOpenaiSummarize(settings.models.summary);
const embed = createOpenaiEmbed(settings.models.embed);
const meetings = createMeetingsStore(mongo);
const transcripts = createTranscriptsStore(mongo);
const queue = createBullmqQueue(secrets.REDIS_URL);

const processDeps = {
  video,
  blob,
  transcribe,
  summarize,
  embed,
  meetings,
  transcripts,
  settings,
};

startMeetingsWorker(secrets.REDIS_URL, (meetingId) => processMeetingJob(processDeps, meetingId));

const app = createApp({
  video,
  blob,
  transcribe,
  meetings,
  transcripts,
  queue,
  settings,
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
});

console.log(`Listening on ${port}`);
