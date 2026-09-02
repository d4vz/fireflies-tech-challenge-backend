import type { Hono } from "hono";
import type { Blob } from "../../lib/blob/index.ts";
import type { Transcribe } from "../../lib/transcribe/index.ts";
import type { Video } from "../../lib/video/index.ts";

export type HealthDeps = {
  video: Video;
  blob: Blob;
  transcribe: Transcribe;
};

type ServiceName = "video" | "blob" | "transcribe";
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
    const [video, blob, transcribe] = await Promise.all([
      pingService(() => deps.video.ping()),
      pingService(() => deps.blob.ping()),
      pingService(() => deps.transcribe.ping()),
    ]);
    const services: Record<ServiceName, PingResult> = { video, blob, transcribe };
    const ok = services.video === "ok" && services.blob === "ok" && services.transcribe === "ok";
    return c.json({ status: ok ? "ok" : "error", services }, ok ? 200 : 503);
  });
}
