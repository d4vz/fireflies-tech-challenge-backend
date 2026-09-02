export type Video = {
  extract: (inputPath: string) => Promise<string>;
  slice: (inputPath: string, startSeconds: number, durationSeconds: number) => Promise<string>;
  durationInSeconds: (inputPath: string) => Promise<number>;
  thumbnail: (inputPath: string) => Promise<File>;
};
