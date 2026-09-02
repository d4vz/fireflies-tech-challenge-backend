export type Video = {
  extract: (file: File) => Promise<File>;
  durationInSeconds: (file: File) => Promise<number>;
  thumbnail: (file: File) => Promise<File>;
};
