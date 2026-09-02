export type Video = {
  extract: (inputPath: string) => Promise<string>;
  durationInSeconds: (inputPath: string) => Promise<number>;
  thumbnail: (inputPath: string) => Promise<File>;
};
