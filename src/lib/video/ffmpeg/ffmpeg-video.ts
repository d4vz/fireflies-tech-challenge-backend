import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Video } from "../index.ts";

function failMessage(command: string, code: number | null, stderr: string) {
  const detail = stderr.trim();
  if (detail.length === 0) {
    return `${command} exited with ${code}`;
  }
  return `${command} exited with ${code}: ${detail}`;
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(failMessage(command, code, stderr)));
    });
  });
}

async function writeInput(file: File) {
  const dir = await mkdtemp(path.join(tmpdir(), "media-"));
  const inputPath = path.join(dir, file.name || "input.mp4");
  await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
  return { dir, inputPath };
}

export function createFfmpegVideo(): Video {
  return {
    extract: async (file) => {
      const { dir, inputPath } = await writeInput(file);
      const outputPath = path.join(dir, "audio.mp3");
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
    durationInSeconds: async (file) => {
      const { inputPath } = await writeInput(file);
      const output = await run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ]);
      const seconds = Number(output.trim());
      if (Number.isNaN(seconds)) {
        throw new Error(`ffprobe did not return a duration: ${output.trim()}`);
      }
      return Math.round(seconds);
    },
    thumbnail: async (file) => {
      const { dir, inputPath } = await writeInput(file);
      const outputPath = path.join(dir, "thumb.jpg");
      await run("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-ss",
        "0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ]);
      const image = await readFile(outputPath);
      return new File([image], "thumb.jpg", { type: "image/jpeg" });
    },
  };
}
