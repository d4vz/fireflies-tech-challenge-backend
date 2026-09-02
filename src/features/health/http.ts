import type { Hono } from "hono";
import type { Blob } from "../../lib/blob/index.ts";
import type { Transcribe } from "../../lib/transcribe/index.ts";

export type HealthDeps = {
  blob: Blob;
  transcribe: Transcribe;
};

type ServiceName = "blob" | "transcribe";
type PingResult = string;

async function pingService(ping: () => Promise<void>): Promise<PingResult> {
  try {
    await ping();
    return "ok";
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return "unknown error";
  }
}

export function mountHealth(app: Hono, deps: HealthDeps) {
  app.get("/health", async (c) => {
    const [blob, transcribe] = await Promise.all([
      pingService(() => deps.blob.ping()),
      pingService(() => deps.transcribe.ping()),
    ]);
    const services: Record<ServiceName, PingResult> = { blob, transcribe };
    const ok = services.blob === "ok" && services.transcribe === "ok";
    return c.json({ status: ok ? "ok" : "error", services }, ok ? 200 : 503);
  });
}
