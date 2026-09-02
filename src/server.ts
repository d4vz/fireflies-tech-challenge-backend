import { serve } from "@hono/node-server";
import { openai } from "@ai-sdk/openai";
import { minioBlobFromEnv } from "./lib/blob/minio/minio-blob.ts";
import { createClerkAuthVerify } from "./lib/auth/clerk/clerk-jwt.ts";
import { loadSettings, parseSecrets, settingsFileUrl } from "./lib/config/index.ts";
import { mongoFromEnv } from "./lib/db/mongo/mongo-db.ts";
import { createOpenaiEmbed } from "./lib/embed/openai/openai-embed.ts";
import { createBullmqQueue, startMeetingsWorker } from "./lib/queue/bullmq/bullmq-queue.ts";
import { createOpenaiSummarize } from "./lib/summarize/openai/openai-summarize.ts";
import { createOpenaiTranscribe } from "./lib/transcribe/openai/openai-transcribe.ts";
import { createFfmpegVideo } from "./lib/video/ffmpeg/ffmpeg-video.ts";
import { createApp } from "./create-app.ts";
import { processMeetingJob } from "./features/meetings/process-meeting.ts";
import { createMongoMeetings } from "./features/meetings/mongo-meetings.ts";
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
const model = openai(settings.models.chat);
const mongoMeetings = createMongoMeetings(mongo);
const transcripts = createTranscriptsStore(mongo);
const queue = createBullmqQueue(secrets.REDIS_URL);
const auth = createClerkAuthVerify(secrets.CLERK_SECRET_KEY);

const processDeps = {
  video,
  blob,
  transcribe,
  summarize,
  embed,
  meetings: mongoMeetings.store,
  transcripts,
  settings,
};

startMeetingsWorker(secrets.REDIS_URL, (meetingId, options) =>
  processMeetingJob(processDeps, meetingId, options),
);

await transcripts.ensureVectorIndex();

const app = createApp({
  video,
  blob,
  transcribe,
  meetings: mongoMeetings.meetings,
  transcripts,
  queue,
  settings,
  embed,
  model,
  auth,
  origin: secrets.FRONTEND_ORIGIN,
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
});

console.log(`Listening on ${port}`);
