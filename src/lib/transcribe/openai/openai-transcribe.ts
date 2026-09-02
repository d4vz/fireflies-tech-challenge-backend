import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import type { Transcribe } from "../index.ts";
import { toTranscript, diarizedResponseSchema } from "./to-transcript.ts";

export const TRANSCRIBE_TIMEOUT_MS = 60 * 60 * 1_000;
export const OPENAI_TRANSCRIBE_WINDOW_SECONDS = 120;

export function createOpenaiTranscribe(model: string): Transcribe {
  const client = new OpenAI({ timeout: TRANSCRIBE_TIMEOUT_MS });
  return {
    windowSeconds: OPENAI_TRANSCRIBE_WINDOW_SECONDS,
    run: async (audioPath) => {
      const transcription = await client.audio.transcriptions.create({
        file: await toFile(await readFile(audioPath), path.basename(audioPath), {
          type: "audio/mpeg",
        }),
        model,
        response_format: "diarized_json",
        chunking_strategy: "auto",
      });
      return toTranscript(diarizedResponseSchema.parse(transcription));
    },
    ping: async () => {
      await client.models.list();
    },
  };
}
