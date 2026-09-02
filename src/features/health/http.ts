import type { Hono } from "hono";
import type { Audio } from "../../../lib/audio/index.ts";
import type { Blob } from "../../../lib/blob/index.ts";
import type { Transcribe } from "../../../lib/transcribe/index.ts";

export type HealthDeps = {
  audio: Audio;
  blob: Blob;
  transcribe: Transcribe;
};

type ServiceName = "audio" | "blob" | "transcribe";
type PingResult = "ok" | "error";

async function pingService(ping: () => Promise<void>): Promise<PingResult> {
  try {
    await ping();
    return "ok";
  } catch {
    return "error";
  }
}

export function mountHealth(app: Hono, deps: HealthDeps) {
  app.get("/health", async (c) => {
    const [audio, blob, transcribe] = await Promise.all([
      pingService(() => deps.audio.ping()),
      pingService(() => deps.blob.ping()),
      pingService(() => deps.transcribe.ping()),
    ]);
    const services: Record<ServiceName, PingResult> = { audio, blob, transcribe };
    const ok = services.audio === "ok" && services.blob === "ok" && services.transcribe === "ok";
    return c.json({ status: ok ? "ok" : "error", services }, ok ? 200 : 503);
  });
}
