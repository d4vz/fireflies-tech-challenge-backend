import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Audio } from "../index.ts";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}`));
    });
  });
}

export function createFfmpegAudio(): Audio {
  return {
    extract: async (file) => {
      const dir = await mkdtemp(path.join(tmpdir(), "transcribe-"));
      const inputPath = path.join(dir, file.name || "input.mp4");
      const outputPath = path.join(dir, "audio.mp3");
      await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
      await run("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-q:a",
        "4",
        outputPath,
      ]);
      const audio = await readFile(outputPath);
      return new File([audio], "audio.mp3", { type: "audio/mpeg" });
    },
    ping: () => run("ffmpeg", ["-version"]),
  };
}
