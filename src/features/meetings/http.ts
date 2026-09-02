import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { parse } from "../../lib/middleware/index.ts";
import { uploadFormSchema } from "./upload-file.ts";
import { uploadMeeting, type UploadMeetingDeps } from "./upload-meeting.ts";

export function mountMeetings(app: Hono, deps: UploadMeetingDeps) {
  app.get("/meetings", async (c) => {
    return c.json(await deps.meetings.list());
  });

  app.post("/meetings/upload", parse("form", uploadFormSchema(deps.settings.upload)), async (c) => {
    const { file } = c.req.valid("form");
    return streamSSE(c, async (stream) => {
      try {
        for await (const item of uploadMeeting(deps, file)) {
          if (item.event === "progress") {
            await stream.writeSSE({
              event: "progress",
              data: JSON.stringify({ stage: item.stage }),
            });
          }
          if (item.event === "done") {
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify(item.meeting),
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: message }),
        });
      }
    });
  });
}
