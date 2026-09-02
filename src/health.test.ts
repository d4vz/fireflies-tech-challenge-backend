import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./create-app.ts";

const idle = {
  hello: { greet: async () => "" },
  audio: { extract: async (file: File) => file, ping: async () => {} },
  blob: { put: async (input: { key: string }) => input.key, ping: async () => {} },
  transcribe: { run: async () => ({ text: "" }), ping: async () => {} },
};

test("GET /health returns ok when every service ping succeeds", async () => {
  const app = createApp(idle);
  const res = await app.request("/health");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: "ok",
    services: { audio: "ok", blob: "ok", transcribe: "ok" },
  });
});

test("GET /health returns 503 when a service ping fails", async () => {
  const app = createApp({
    ...idle,
    blob: {
      put: async (input) => input.key,
      ping: async () => {
        throw new Error("minio down");
      },
    },
  });
  const res = await app.request("/health");

  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {
    status: "error",
    services: { audio: "ok", blob: "error", transcribe: "ok" },
  });
});
