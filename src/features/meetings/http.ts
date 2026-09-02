import type { Hono } from "hono";
import { uploadMeeting, type UploadMeetingDeps } from "./upload-meeting.ts";

export function mountMeetings(app: Hono, deps: UploadMeetingDeps) {
  app.post("/meetings/upload", async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    return c.json(await uploadMeeting(deps, file));
  });
}
