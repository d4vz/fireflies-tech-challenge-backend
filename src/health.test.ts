import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { loadSettings, settingsFileUrl } from "./lib/config/index.ts";
import { createApp } from "./create-app.ts";

const settings = await loadSettings(settingsFileUrl);

const idle = {
  video: {
    extract: async (file: File) => file,
    durationInSeconds: async () => 0,
    thumbnail: async (file: File) => file,
  },
  blob: { put: async (input: { key: string }) => input.key, ping: async () => {} },
  transcribe: { run: async () => ({ text: "" }), ping: async () => {} },
  summarize: {
    run: async () => ({ text: "", takeaways: [], actionItems: [] }),
  },
  meetings: {
    createId: () => new ObjectId("000000000000000000000001"),
    insert: async () => {},
    list: async () => [],
  },
  settings,
};

test("GET /health returns ok when every service ping succeeds", async () => {
  const app = createApp(idle);
  const res = await app.request("/health");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: "ok",
    services: { blob: "ok", transcribe: "ok" },
  });
});

test("GET /health allows cross-origin frontend requests", async () => {
  const app = createApp(idle);
  const res = await app.request("/health", {
    headers: { Origin: "http://localhost:8080" },
  });

  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
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
    services: { blob: "minio down", transcribe: "ok" },
  });
});
