import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SSEStreamingApi, streamSSE } from "hono/streaming";
import type { Blob } from "../../lib/blob/index.ts";
import { createRequestTempFile, isAllowedFormat } from "./upload-file.ts";
import { UploadEvent, uploadMeeting, type UploadMeetingDeps } from "./upload-meeting.ts";
import { meetingThumbnailKey, meetingVideoKey } from "./store.ts";

async function sendStoredObject(blob: Blob, key: string, fallbackType: string) {
  const file = await blob.get(key);
  if (!file) {
    return undefined;
  }
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType || fallbackType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export function mountMeetings(app: Hono, deps: UploadMeetingDeps) {
  app.get("/meetings", async (c) => {
    return c.json(await deps.meetings.list());
  });

  app.get("/meetings/:id/thumbnail", async (c) => {
    return (
      (await sendStoredObject(deps.blob, meetingThumbnailKey(c.req.param("id")), "image/jpeg")) ??
      c.json({ error: "not found" }, 404)
    );
  });

  app.get("/meetings/:id/video", async (c) => {
    return (
      (await sendStoredObject(
        deps.blob,
        meetingVideoKey(c.req.param("id")),
        "application/octet-stream",
      )) ?? c.json({ error: "not found" }, 404)
    );
  });

  app.get("/meetings/:id", async (c) => {
    const meeting = await deps.meetings.get(c.req.param("id"));
    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }
    return c.json(meeting);
  });

  app.post(
    "/meetings/upload",
    bodyLimit({
      maxSize: deps.settings.upload.maxFileBytes,
      onError: (c) => c.json({ error: "file must be 5 GB or smaller" }, 413),
    }),
    async (c) => {
      const { file, closeFile } = await createRequestTempFile(c.req.raw, {
        name: c.req.query("filename")?.trim() || "video",
        type: c.req.header("content-type") ?? "",
      });

      if (!file) {
        return c.json({ error: "file is required" }, 400);
      }

      if (!isAllowedFormat(file, deps.settings.upload)) {
        await closeFile();
        return c.json({ error: "file format is not supported" }, 400);
      }

      const results = uploadMeeting(deps, file);

      return streamSSE(c, (stream) => handleMeetingResults(results, stream, closeFile));
    },
  );
}

const handleMeetingResults = async (
  results: AsyncGenerator<UploadEvent>,
  stream: SSEStreamingApi,
  closeFile: () => Promise<void>,
) => {
  try {
    for await (const item of results) {
      switch (item.event) {
        case "progress":
          await stream.writeSSE({
            event: "progress",
            data: JSON.stringify({ stage: item.stage }),
          });
          break;
        case "done":
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify(item.meeting),
          });
          break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await stream.writeSSE({
      event: "error",
      data: JSON.stringify({ error: message }),
    });
  } finally {
    await closeFile();
  }
};
