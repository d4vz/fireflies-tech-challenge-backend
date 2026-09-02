import type { Hono } from "hono";
import { transcribeMeeting, type TranscribeMeetingDeps } from "./transcribe-meeting.ts";

export function mountTranscribe(app: Hono, deps: TranscribeMeetingDeps) {
  app.post("/transcribe", async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    return c.json(await transcribeMeeting(deps, file));
  });
}
