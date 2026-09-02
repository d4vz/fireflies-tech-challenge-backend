import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./create-app.ts";

test("GET /hello sends a hello message to OpenAI and returns the reply", async () => {
  const app = createApp({
    hello: { greet: async () => "Hello from the model" },
    audio: { extract: async (file) => file, ping: async () => {} },
    blob: { put: async (input) => input.key, ping: async () => {} },
    transcribe: { run: async () => ({ text: "" }), ping: async () => {} },
  });

  const res = await app.request("/hello");

  assert.equal(res.status, 200);
  assert.equal(await res.text(), "Hello from the model");
});
