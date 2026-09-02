import { serve } from "@hono/node-server";
import OpenAI from "openai";
import { createFfmpegAudio } from "../lib/audio/ffmpeg/ffmpeg-audio.ts";
import { minioBlobFromEnv } from "../lib/blob/minio/minio-blob.ts";
import { createOpenaiTranscribe } from "../lib/transcribe/openai/openai-transcribe.ts";
import { createApp } from "./create-app.ts";

const port = Number(process.env.PORT) || 3000;

const app = createApp({
  hello: {
    greet: async () => {
      const response = await new OpenAI().responses.create({
        model: "gpt-4o-mini",
        input: "hello",
      });
      return response.output_text;
    },
  },
  audio: createFfmpegAudio(),
  blob: minioBlobFromEnv(),
  transcribe: createOpenaiTranscribe(),
});

serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
});

console.log(`Listening on ${port}`);
