export type Embed = {
  model: string;
  run: (texts: string[]) => Promise<number[][]>;
};
