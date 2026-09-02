import { createAssemblyaiTranscribe } from "./assemblyai/assemblyai-transcribe.ts";
import { createOpenaiTranscribe } from "./openai/openai-transcribe.ts";
import type { Transcribe } from "./index.ts";

export const ASSEMBLYAI_MODEL = "assemblyai";

export function createTranscribe(
  model: string,
  secrets: { OPENAI_API_KEY?: string; ASSEMBLYAI_API_KEY?: string },
): Transcribe {
  if (model === ASSEMBLYAI_MODEL) {
    const apiKey = secrets.ASSEMBLYAI_API_KEY;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error("ASSEMBLYAI_API_KEY is missing");
    }
    return createAssemblyaiTranscribe(apiKey);
  }
  return createOpenaiTranscribe(model);
}
