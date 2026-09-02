import { Hono } from "hono";
import type { Audio } from "../lib/audio/index.ts";
import type { Blob } from "../lib/blob/index.ts";
import type { Transcribe } from "../lib/transcribe/index.ts";
import { mountHealth } from "./features/health/http.ts";
import { mountTranscribe } from "./features/transcribe/http.ts";

export type Hello = {
  greet: () => Promise<string>;
};

export type CreateAppDeps = {
  hello: Hello;
  audio: Audio;
  blob: Blob;
  transcribe: Transcribe;
};

export function createApp(deps: CreateAppDeps) {
  const app = new Hono();

  app.get("/hello", async (c) => {
    return c.text(await deps.hello.greet());
  });

  mountHealth(app, deps);
  mountTranscribe(app, deps);

  return app;
}
