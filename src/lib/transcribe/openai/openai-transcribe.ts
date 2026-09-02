import OpenAI from "openai";
import type { Transcribe } from "../index.ts";

export function createOpenaiTranscribe(model: string): Transcribe {
  const client = new OpenAI();
  return {
    run: async (file) => {
      const transcription = await client.audio.transcriptions.create({
        file,
        model,
      });
      return { text: transcription.text };
    },
    ping: async () => {
      await client.models.list();
    },
  };
}
