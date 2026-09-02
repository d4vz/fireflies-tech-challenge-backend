import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AppSettings } from "../../lib/config/index.ts";

export type SavedFile = {
  name: string;
  type: string;
  size: number;
  path: string;
};

function closeNothing() {
  return Promise.resolve();
}

export async function createRequestTempFile(
  request: Request,
  meta: { name: string; type: string },
): Promise<{ file: SavedFile | undefined; closeFile: () => Promise<void> }> {
  if (!request.body) {
    return { file: undefined, closeFile: closeNothing };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "upload-"));
  const dest = path.join(dir, "upload");
  const writer = createWriteStream(dest);
  const closeFile = () => rm(dir, { recursive: true, force: true });
  try {
    for await (const chunk of request.body) {
      if (!writer.write(chunk)) {
        await once(writer, "drain");
      }
    }
    writer.end();
    await once(writer, "finish");
    const { size } = await stat(dest);
    if (size === 0) {
      await closeFile();
      return { file: undefined, closeFile: closeNothing };
    }
    return {
      file: {
        name: meta.name || "video",
        type: meta.type,
        size,
        path: dest,
      },
      closeFile,
    };
  } catch (error) {
    writer.destroy();
    await closeFile();
    throw error;
  }
}

function fileExtension(name: string) {
  const index = name.lastIndexOf(".");
  if (index === -1) {
    return "";
  }
  return name.slice(index + 1).toLowerCase();
}

export function isAllowedFormat(
  file: { name: string; type: string },
  rules: AppSettings["upload"],
) {
  const extOk = rules.extensions.includes(fileExtension(file.name));
  const mimeOk = file.type.length > 0 && rules.mimeTypes.includes(file.type);
  return extOk || mimeOk;
}
