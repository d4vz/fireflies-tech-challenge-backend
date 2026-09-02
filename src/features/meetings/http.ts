import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Blob } from "../../lib/blob/index.ts";
import type { AppSettings } from "../../lib/config/index.ts";
import type { Queue } from "../../lib/queue/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { createRequestTempFile, isAllowedFormat } from "./upload-file.ts";
import { storeMeeting } from "./store-meeting.ts";
import { meetingThumbnailKey, meetingVideoKey, type MeetingsStore } from "./store.ts";
import type { TranscriptsStore } from "./transcripts.ts";

export type MeetingsHttpDeps = {
  video: Video;
  blob: Blob;
  meetings: MeetingsStore;
  transcripts: TranscriptsStore;
  queue: Queue;
  settings: AppSettings;
};

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

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function positiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function mountMeetings(app: Hono, deps: MeetingsHttpDeps) {
  app.get("/meetings", async (c) => {
    const page = positiveInt(c.req.query("page"), DEFAULT_PAGE, Number.MAX_SAFE_INTEGER);
    const limit = positiveInt(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      deps.meetings.list(skip, limit),
      deps.meetings.count(),
    ]);
    return c.json({ items, total, page, limit });
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

  app.get("/meetings/:id/transcripts", async (c) => {
    const meeting = await deps.meetings.get(c.req.param("id"));
    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }
    return c.json(await deps.transcripts.listByMeeting(c.req.param("id")));
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

      try {
        const meeting = await storeMeeting(deps, file);
        return c.json(meeting, 201);
      } finally {
        await closeFile();
      }
    },
  );
}
