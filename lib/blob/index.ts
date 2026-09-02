export type PutBlob = {
  key: string;
  body: Uint8Array;
  contentType: string;
};

export type Blob = {
  put: (input: PutBlob) => Promise<string>;
  ping: () => Promise<void>;
};
