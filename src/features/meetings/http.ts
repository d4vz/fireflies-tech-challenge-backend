import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SSEStreamingApi, streamSSE } from "hono/streaming";
import { createRequestTempFile, isAllowedFormat } from "./upload-file.ts";
import {
  UploadEvent,
  uploadMeeting,
  UploadStage,
  type UploadMeetingDeps,
} from "./upload-meeting.ts";
import { Meeting } from "./store.ts";

export function mountMeetings(app: Hono, deps: UploadMeetingDeps) {
  app.get("/meetings", async (c) => {
    return c.json(await deps.meetings.list());
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
  const actions = {
    progress: async ({ stage }: { stage: UploadStage }) => {
      await stream.writeSSE({
        event: "progress",
        data: JSON.stringify({ stage }),
      });
    },
    done: async ({ meeting }: { meeting: Meeting }) => {
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify(meeting),
      });
    },
    error: async ({ error }: { error: Error }) => {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: error.message }),
      });
    },
  };

  try {
    for await (const item of results) {
      switch (item.event) {
        case "progress":
          await actions.progress({ stage: item.stage });
          break;
        case "done":
          await actions.done({ meeting: item.meeting });
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
