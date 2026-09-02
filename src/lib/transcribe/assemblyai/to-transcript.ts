import { z } from "zod";
import { labeledTurnText, type Transcript, type TranscriptSegment } from "../index.ts";

const utteranceSchema = z.object({
  speaker: z.string().min(1),
  start: z.number().finite(),
  end: z.number().finite(),
  text: z.string(),
});

export const assemblyaiTranscriptSchema = z.object({
  utterances: z.array(utteranceSchema).optional(),
});

type AssemblyaiTranscript = z.infer<typeof assemblyaiTranscriptSchema>;

export function utterancesToTranscript(raw: AssemblyaiTranscript): Transcript {
  const segments: TranscriptSegment[] = [];
  for (const utterance of raw.utterances ?? []) {
    const text = utterance.text.trim();
    if (text === "") {
      continue;
    }
    segments.push({
      speaker: utterance.speaker,
      start: utterance.start / 1000,
      end: utterance.end / 1000,
      text,
    });
  }
  return {
    text: segments.map((item) => labeledTurnText(item.speaker, item.text)).join("\n"),
    segments,
  };
}
