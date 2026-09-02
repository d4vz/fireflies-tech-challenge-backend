import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import type { Actor } from "../../lib/auth/index.ts";
import type { Blob } from "../../lib/blob/index.ts";
import type { AppSettings } from "../../lib/config/index.ts";
import type { AppEnv } from "../../lib/middleware/index.ts";
import type { Queue } from "../../lib/queue/index.ts";
import type { Video } from "../../lib/video/index.ts";
import { createRequestTempFile, isAllowedFormat } from "./upload-file.ts";
import { storeMeeting } from "./store-meeting.ts";
import {
  meetingThumbnailKey,
  meetingVideoKey,
  type MeetingsStore,
  type OwnedMeetings,
} from "./store.ts";
import type { TranscriptsStore } from "./transcripts.ts";
import { listMeetings, meetingListQuerySchema } from "./list-query.ts";

export type MeetingsHttpDeps = {
  video: Video;
  blob: Blob;
  meetings: MeetingsStore;
  ownedMeetings: (actor: Actor) => OwnedMeetings;
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

export function mountMeetings(app: Hono<AppEnv>, deps: MeetingsHttpDeps) {
  app.get("/meetings", zValidator("query", meetingListQuerySchema), async (c) => {
    return c.json(await listMeetings(deps.ownedMeetings(c.get("actor")), c.req.valid("query")));
  });

  app.get("/meetings/:id/thumbnail", async (c) => {
    const meeting = await deps.ownedMeetings(c.get("actor")).get(c.req.param("id"));
    if (!meeting) {
      return c.json({ error: "not found" }, 404);
    }
    return (
      (await sendStoredObject(
        deps.blob,
        meetingThumbnailKey(meeting._id.toHexString()),
        "image/jpeg",
      )) ?? c.json({ error: "not found" }, 404)
    );
  });

  app.get("/meetings/:id/video", async (c) => {
    const meeting = await deps.ownedMeetings(c.get("actor")).get(c.req.param("id"));
    if (!meeting) {
      return c.json({ error: "not found" }, 404);
    }
    return (
      (await sendStoredObject(
        deps.blob,
        meetingVideoKey(meeting._id.toHexString()),
        "application/octet-stream",
      )) ?? c.json({ error: "not found" }, 404)
    );
  });

  app.get("/meetings/:id/transcripts", async (c) => {
    const meeting = await deps.ownedMeetings(c.get("actor")).get(c.req.param("id"));
    if (!meeting) {
      return c.json({ error: "meeting not found" }, 404);
    }
    return c.json(await deps.transcripts.listByMeeting(meeting._id.toHexString()));
  });

  app.get("/meetings/:id", async (c) => {
    const meeting = await deps.ownedMeetings(c.get("actor")).get(c.req.param("id"));
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
        const meeting = await storeMeeting(deps, file, c.get("actor"));
        return c.json(meeting, 201);
      } finally {
        await closeFile();
      }
    },
  );
}
