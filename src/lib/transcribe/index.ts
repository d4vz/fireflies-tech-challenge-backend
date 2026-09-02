export type TranscriptSegment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

export type Transcript = {
  text: string;
  segments: TranscriptSegment[];
};

export type Transcribe = {
  run: (audioPath: string) => Promise<Transcript>;
  ping: () => Promise<void>;
  windowSeconds?: number;
};

export function labeledTurnText(speaker: string, text: string) {
  return `${speaker}: ${text}`;
}
