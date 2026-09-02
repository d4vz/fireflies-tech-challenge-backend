export type Transcript = {
  text: string;
};

export type Transcribe = {
  run: (file: File) => Promise<Transcript>;
  ping: () => Promise<void>;
};
