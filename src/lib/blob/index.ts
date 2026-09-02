import type { Readable } from "node:stream";

export type PutBlob = {
  key: string;
  body: Uint8Array | Readable;
  contentType: string;
  size?: number;
};

export type GetBlob = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
};

export type Blob = {
  put: (input: PutBlob) => Promise<string>;
  get: (key: string) => Promise<GetBlob | undefined>;
  ping: () => Promise<void>;
};
