import { z } from "zod";
import { labeledTurnText, type Transcript, type TranscriptSegment } from "../index.ts";

const diarizedSegmentSchema = z.object({
  speaker: z.string().min(1),
  start: z.number().finite(),
  end: z.number().finite(),
  text: z.string(),
});

export const diarizedResponseSchema = z.object({
  segments: z.array(diarizedSegmentSchema).optional(),
});

type DiarizedInput = z.infer<typeof diarizedResponseSchema>;

export function toTranscript(raw: DiarizedInput): Transcript {
  const segments: TranscriptSegment[] = [];
  for (const segment of raw.segments ?? []) {
    const text = segment.text.trim();
    if (text === "") {
      continue;
    }
    segments.push({
      speaker: segment.speaker,
      start: segment.start,
      end: segment.end,
      text,
    });
  }
  return {
    text: segments.map((item) => labeledTurnText(item.speaker, item.text)).join("\n"),
    segments,
  };
}
