export type Transcript = {
  text: string;
};

export type Transcribe = {
  run: (audioPath: string) => Promise<Transcript>;
  ping: () => Promise<void>;
};
