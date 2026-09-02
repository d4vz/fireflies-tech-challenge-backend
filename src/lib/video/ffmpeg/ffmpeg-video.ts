import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Video } from "../index.ts";

function failMessage(command: string, code: number | null, stderr: string) {
  const detail = stderr.trim();
  if (detail.length === 0) {
    return `${command} exited with ${code}`;
  }
  return `${command} exited with ${code}: ${detail}`;
}

function run(command: string, args: string[], failed: string) {
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
      console.error(failMessage(command, code, stderr));
      reject(new Error(failed));
    });
  });
}

function beside(inputPath: string, name: string) {
  return path.join(path.dirname(inputPath), name);
}

function parseSeconds(output: string) {
  const seconds = Number(output.trim());
  if (Number.isFinite(seconds)) {
    return seconds;
  }
  return undefined;
}

function lastPacket(output: string) {
  const lines = output.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const [pts, duration] = lines[i].split(",");
    const start = Number(pts);
    if (!Number.isFinite(start)) {
      continue;
    }
    const length = Number(duration);
    return { start, end: Number.isFinite(length) ? start + length : start };
  }
  return undefined;
}

async function formatDuration(inputPath: string) {
  const output = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    "Could not read media duration",
  );
  return parseSeconds(output);
}

async function probePackets(inputPath: string, stream: "v:0" | "a:0", failed: string) {
  return run(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      stream,
      "-show_entries",
      "packet=pts_time,duration_time",
      "-of",
      "csv=p=0",
      inputPath,
    ],
    failed,
  );
}

async function packetDuration(inputPath: string, stream: "v:0" | "a:0") {
  try {
    return lastPacket(await probePackets(inputPath, stream, "Could not read media duration"))?.end;
  } catch {
    return undefined;
  }
}

const THUMBNAIL_SECONDS = 3;

async function thumbnailSeek(inputPath: string) {
  const duration = await formatDuration(inputPath);
  if (duration !== undefined && duration >= THUMBNAIL_SECONDS + 0.5) {
    return THUMBNAIL_SECONDS;
  }
  const last = lastPacket(await probePackets(inputPath, "v:0", "Could not create a thumbnail"));
  if (last === undefined) {
    return 0;
  }
  return Math.min(THUMBNAIL_SECONDS, Math.max(0, last.start));
}

export function createFfmpegVideo(): Video {
  return {
    extract: async (inputPath) => {
      const outputPath = beside(inputPath, "audio.mp3");
      await run(
        "ffmpeg",
        ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", outputPath],
        "Could not extract audio",
      );
      return outputPath;
    },
    slice: async (inputPath, startSeconds, durationSeconds) => {
      const outputPath = beside(inputPath, `audio-${startSeconds}.mp3`);
      await run(
        "ffmpeg",
        [
          "-y",
          "-i",
          inputPath,
          "-ss",
          String(startSeconds),
          "-t",
          String(durationSeconds),
          "-acodec",
          "libmp3lame",
          "-q:a",
          "4",
          outputPath,
        ],
        "Could not slice audio",
      );
      return outputPath;
    },
    durationInSeconds: async (inputPath) => {
      const seconds =
        (await formatDuration(inputPath)) ??
        (await packetDuration(inputPath, "v:0")) ??
        (await packetDuration(inputPath, "a:0"));
      if (seconds === undefined) {
        throw new Error("Could not read media duration");
      }
      return Math.round(seconds);
    },
    thumbnail: async (inputPath) => {
      const outputPath = beside(inputPath, "thumb.jpg");
      const seek = await thumbnailSeek(inputPath);
      await run(
        "ffmpeg",
        ["-y", "-i", inputPath, "-ss", seek.toFixed(3), "-frames:v", "1", "-q:v", "2", outputPath],
        "Could not create a thumbnail",
      );
      const image = await readFile(outputPath);
      return new File([image], "thumb.jpg", { type: "image/jpeg" });
    },
  };
}
