import { createReadStream } from "node:fs";
import path from "node:path";
import OpenAI, { toStreamingFile } from "openai";
import type { Transcribe } from "../index.ts";

export function createOpenaiTranscribe(model: string): Transcribe {
  const client = new OpenAI();
  return {
    run: async (audioPath) => {
      const transcription = await client.audio.transcriptions.create({
        file: toStreamingFile(createReadStream(audioPath), path.basename(audioPath), {
          type: "audio/mpeg",
        }),
        model,
      });
      return { text: transcription.text };
    },
    ping: async () => {
      await client.models.list();
    },
  };
}
