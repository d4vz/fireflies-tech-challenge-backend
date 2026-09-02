export type Audio = {
  extract: (file: File) => Promise<File>;
  ping: () => Promise<void>;
};
