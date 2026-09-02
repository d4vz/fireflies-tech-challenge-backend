import OpenAI from "openai";
import type { Transcribe } from "../index.ts";

export function createOpenaiTranscribe(): Transcribe {
  const client = new OpenAI();
  return {
    run: async (file) => {
      const transcription = await client.audio.transcriptions.create({
        file,
        model: "gpt-4o-transcribe",
      });
      return { text: transcription.text };
    },
    ping: async () => {
      await client.models.list();
    },
  };
}
