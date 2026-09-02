import type { Readable } from "node:stream";

export type PutBlob = {
  key: string;
  body: Uint8Array | Readable;
  contentType: string;
  size?: number;
};

export type Blob = {
  put: (input: PutBlob) => Promise<string>;
  ping: () => Promise<void>;
};
