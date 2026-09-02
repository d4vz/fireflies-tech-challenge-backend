import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function tempFileFrom(
  body: ReadableStream<Uint8Array>,
  dirPrefix: string,
  fileName: string,
): Promise<{ path: string; close: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), dirPrefix));
  const dest = path.join(dir, fileName);
  const writer = createWriteStream(dest);
  const close = () => rm(dir, { recursive: true, force: true });
  try {
    for await (const chunk of body) {
      if (!writer.write(chunk)) {
        await once(writer, "drain");
      }
    }
    writer.end();
    await once(writer, "finish");
    return { path: dest, close };
  } catch (error) {
    writer.destroy();
    await close();
    throw error;
  }
}
